#!/usr/bin/env python3
"""Read-only OS observation of one exact owned Candidate cgroup.

This observer never sends process signals or calls a Gateway. It records source
observations; matching a real exec/cancel call is a separate evidence join.
"""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import pwd
import re
import signal
import subprocess
import time


def sha(data):
    return hashlib.sha256(data).hexdigest()


def parse_stat(text):
    # comm can contain spaces and closing parentheses. Remaining stat fields
    # begin after the final ')' and retain their documented Linux positions.
    close = text.rfind(')')
    if close < 0:
        raise ValueError('Malformed proc stat')
    pid = int(text[:text.find('(')].strip())
    fields = text[close + 1:].split()
    if len(fields) < 22:
        raise ValueError('Incomplete proc stat')
    return {'pid': pid, 'state': fields[0], 'ppid': int(fields[1]),
            'pgid': int(fields[2]), 'sid': int(fields[3]),
            'startTimeTicks': int(fields[19]), 'rssPages': int(fields[21])}


def properties(unit):
    names = ['MainPID', 'ControlGroup', 'ActiveState', 'SubState', 'User',
             'ExecMainStartTimestampMonotonic', 'RuntimeMaxUSec']
    output = subprocess.check_output(
        ['systemctl', 'show', unit] + [item for name in names for item in ['-p', name]],
        text=True, timeout=10)
    return dict(line.split('=', 1) for line in output.splitlines() if '=' in line)


def memberships(pid):
    result = []
    for row in pathlib.Path('/proc', str(pid), 'cgroup').read_text().splitlines():
        parts = row.split(':', 2)
        if len(parts) == 3:
            result.append(parts[2])
    return result


def in_group(group, candidate):
    return candidate == group or candidate.startswith(group + '/')


def observe_process(pid, group):
    directory = pathlib.Path('/proc', str(pid))
    first = parse_stat((directory / 'stat').read_text())
    groups = memberships(pid)
    if not any(in_group(group, entry) for entry in groups):
        raise ValueError('Process moved outside the exact owned cgroup')
    cmdline = (directory / 'cmdline').read_bytes()
    second = parse_stat((directory / 'stat').read_text())
    if first['startTimeTicks'] != second['startTimeTicks']:
        raise ValueError('PID reused during observation')
    args = cmdline.rstrip(b'\0').split(b'\0') if cmdline else []
    executable = pathlib.PurePosixPath(args[0].decode('utf-8', 'replace')).name if args else None
    profile = {
        'pid': pid, 'startTimeTicks': first['startTimeTicks'],
        'uid': directory.stat().st_uid, 'executableBasename': executable,
        'cmdlineSha256': sha(cmdline),
        'argumentSha256': [sha(arg) for arg in args],
        'shellCommandArgumentIndex': next((index + 1 for index, value in enumerate(args[:-1])
                                          if value in [b'-c', b'-lc'] and executable in
                                          ['sh', 'bash', 'dash', 'zsh']), None),
        'cgroupMembershipVerified': True,
    }
    sample = {key: second[key] for key in ['pid', 'startTimeTicks', 'state', 'ppid', 'pgid', 'sid']}
    sample['rssKiB'] = second['rssPages'] * os.sysconf('SC_PAGE_SIZE') // 1024
    return profile, sample


def cgroup_pids(directory):
    root = directory.resolve(strict=True)
    found = set()
    for parent, directories, files in os.walk(root, followlinks=False):
        for name in directories:
            child = pathlib.Path(parent, name)
            if child.is_symlink() or not child.resolve().is_relative_to(root):
                raise ValueError('Cgroup subtree escaped the exact owner')
        if 'cgroup.procs' in files:
            for pid in pathlib.Path(parent, 'cgroup.procs').read_text().split():
                found.add(int(pid))
    return sorted(found)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidate-id', required=True)
    parser.add_argument('--unit', required=True)
    parser.add_argument('--gateway-pid', type=int)
    parser.add_argument('--gateway-start-ticks', type=int)
    parser.add_argument('--binding-path', required=True)
    parser.add_argument('--expected-owner', required=True)
    parser.add_argument('--expected-user', default='lab-db91-parity')
    parser.add_argument('--output', required=True)
    parser.add_argument('--duration-seconds', type=float, default=600)
    parser.add_argument('--poll-ms', type=int, default=50)
    parser.add_argument('--command-sha256')
    args = parser.parse_args()
    assert re.fullmatch(r'candidate-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', args.candidate_id)
    assert args.unit == 'vlab-' + args.candidate_id + '.service'
    assert (args.gateway_pid is None) == (args.gateway_start_ticks is None)
    assert args.gateway_pid is None or (args.gateway_pid > 1 and args.gateway_start_ticks > 0)
    assert 1 <= args.duration_seconds <= 1800 and 20 <= args.poll_ms <= 100
    assert args.command_sha256 is None or re.fullmatch(r'[0-9a-f]{64}', args.command_sha256)
    candidate = pathlib.Path('/srv/vlab-production-mirror/labs/candidate-tests/runs', args.candidate_id)
    assert candidate.resolve(strict=True) == candidate
    binding_path = pathlib.Path(args.binding_path)
    assert binding_path.is_absolute() and binding_path.resolve(strict=True) == binding_path
    binding_bytes = binding_path.read_bytes()
    binding = json.loads(binding_bytes)
    assert binding['owner'] == args.expected_owner
    assert binding['candidateId'] == args.candidate_id and binding['unit'] == args.unit
    assert re.fullmatch(r'[0-9a-f]{40}', binding['sourceCommit'])
    assert re.fullmatch(r'[0-9a-f]{64}', binding['planSha256'])
    assert re.fullmatch(r'[0-9a-f]{64}', binding['freezeSha256'])
    assert binding['identitySource'] == 'exact-owned-cli-invocation'
    expected_uid = pwd.getpwnam(args.expected_user).pw_uid
    assert candidate.stat().st_uid == expected_uid
    prop = properties(args.unit)
    assert prop['ActiveState'] == 'active' and int(prop['MainPID']) > 1
    assert prop['User'] == args.expected_user
    main_pid = int(prop['MainPID'])
    group = prop['ControlGroup']
    assert group.endswith('/' + args.unit) and group.startswith('/')
    cgroup_directory = pathlib.Path('/sys/fs/cgroup' + group)
    assert cgroup_directory.resolve(strict=True) == cgroup_directory
    main, _ = observe_process(main_pid, group)
    assert main['uid'] == expected_uid
    environment_path = candidate / 'environment.json'
    assert environment_path.resolve(strict=True) == environment_path
    main_args = pathlib.Path('/proc', str(main_pid), 'cmdline').read_bytes().split(b'\0')
    assert str(environment_path).encode() in main_args
    # The runner does not store req.owner in this environment. Owner comes from
    # the separately frozen CLI invocation binding, not a synthesized marker.
    environment = json.loads(environment_path.read_bytes())
    assert environment['VLAB_CANDIDATE_ID'] == args.candidate_id
    assert environment['VLAB_CANDIDATE_UNIT'] == args.unit
    assert environment['GPT_LIVE_H5_SOURCE_COMMIT'] == binding['sourceCommit']
    assert pathlib.Path(environment['VLAB_CANDIDATE_RUNTIME']).resolve(strict=True) == candidate / 'runtime'
    del environment
    if args.gateway_pid is not None:
        gateway, _ = observe_process(args.gateway_pid, group)
        assert gateway['startTimeTicks'] == args.gateway_start_ticks and gateway['uid'] == expected_uid
        gateway_args = pathlib.Path('/proc', str(args.gateway_pid), 'cmdline').read_bytes().split(b'\0')
        assert str(candidate / 'runtime/openclaw/dist/index.js').encode() in gateway_args
        assert b'gateway' in gateway_args
    output = pathlib.Path(args.output)
    assert output.is_absolute() and output.parent.resolve(strict=True) == output.parent
    allowed_output = output.is_relative_to(candidate / 'data') or (
        output.is_relative_to('/tmp') and output.parts[2].startswith('codex-gpt-live-pr154-'))
    assert allowed_output and not output.exists()
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    stopping = False
    def stop_observer(signum, frame):
        nonlocal stopping
        stopping = True
    signal.signal(signal.SIGTERM, stop_observer)
    signal.signal(signal.SIGINT, stop_observer)
    profiles = {}
    started = time.monotonic()
    previous = None
    max_gap_ms = 0
    sample_count = 0
    identity_errors = []
    with os.fdopen(fd, 'w', buffering=1) as stream:
        def record(value):
            stream.write(json.dumps(value, separators=(',', ':')) + '\n')
        record({'type': 'observer-start', 'at': time.time_ns() // 1_000_000,
                'candidateId': args.candidate_id, 'unit': args.unit, 'unitProperties': prop,
                'gatewayPid': args.gateway_pid, 'gatewayStartTimeTicks': args.gateway_start_ticks,
                'mainPid': main_pid, 'mainStartTimeTicks': main['startTimeTicks'],
                'owner': args.expected_owner, 'ownerBindingSha256': sha(binding_bytes),
                'ownerBindingSource': 'exact-owned-cli-invocation; runner environment has no req.owner marker',
                'sourceCommit': binding['sourceCommit'], 'planSha256': binding['planSha256'],
                'freezeSha256': binding['freezeSha256'],
                'observerPid': os.getpid(), 'observerSourceSha256': sha(pathlib.Path(__file__).read_bytes()),
                'pollMs': args.poll_ms, 'durationSeconds': args.duration_seconds,
                'expectedCommandSha256': args.command_sha256, 'readOnly': True,
                'signalsSent': False, 'envRecorded': False, 'fullCommandRecorded': False,
                'gatewayCallsMade': False, 'execCallBindingEstablished': False})
        while not stopping and time.monotonic() - started < args.duration_seconds:
            begun = time.monotonic()
            at = time.time_ns() // 1_000_000
            gap = None if previous is None else (begun - previous) * 1000
            if gap is not None:
                max_gap_ms = max(max_gap_ms, gap)
            previous = begun
            samples, errors = [], []
            try:
                current_main = parse_stat(pathlib.Path('/proc', str(main_pid), 'stat').read_text())
                assert current_main['startTimeTicks'] == main['startTimeTicks']
                assert any(in_group(group, entry) for entry in memberships(main_pid))
                if args.gateway_pid is not None:
                    current_gateway = parse_stat(pathlib.Path('/proc', str(args.gateway_pid), 'stat').read_text())
                    assert current_gateway['startTimeTicks'] == args.gateway_start_ticks
                    assert any(in_group(group, entry) for entry in memberships(args.gateway_pid))
                for pid in cgroup_pids(cgroup_directory):
                    try:
                        profile, sample = observe_process(pid, group)
                        key = str(pid) + ':' + str(profile['startTimeTicks'])
                        version = sha(json.dumps(profile, sort_keys=True).encode())
                        if profiles.get(key) != version:
                            profiles[key] = version
                            index = profile['shellCommandArgumentIndex']
                            profile['exactExpectedCommandMatch'] = bool(args.command_sha256 and index is not None and
                                profile['argumentSha256'][index] == args.command_sha256)
                            record({'type': 'process-profile', 'at': at, 'profile': profile})
                        samples.append(sample)
                    except (FileNotFoundError, ProcessLookupError):
                        errors.append({'pid': pid, 'kind': 'exited-during-read'})
                    except (ValueError, AssertionError, PermissionError) as error:
                        errors.append({'pid': pid, 'kind': type(error).__name__})
            except (FileNotFoundError, ValueError, AssertionError, PermissionError) as error:
                identity_errors.append({'at': at, 'kind': type(error).__name__})
                record({'type': 'identity-drift', **identity_errors[-1]})
                break
            record({'type': 'cgroup-sample', 'at': at, 'elapsedMs': (begun - started) * 1000,
                    'gapMs': gap, 'processes': samples, 'readErrors': errors})
            sample_count += 1
            time.sleep(max(0, args.poll_ms / 1000 - (time.monotonic() - begun)))
        record({'type': 'observer-end', 'at': time.time_ns() // 1_000_000,
                'sampleCount': sample_count, 'maximumObservedGapMs': max_gap_ms,
                'identityErrors': identity_errors, 'stoppedByReceivedSignal': stopping,
                'execCallBindingEstablished': False, 'processExtinctionAccepted': False,
                'reason': 'Raw OS source only; exact native exec/cancel identity and deadlines require independent evidence join'})


if __name__ == '__main__':
    main()
