// Executable release fixture for shared VLab code deployment and rollback.
// It has no Gateway hooks and writes no configuration or state.
export function workflowProof() { return 'VLAB_SHARED_WORKTREE_V1'; }
if (import.meta.url === new URL(process.argv[1], 'file:').href) console.log(workflowProof());
