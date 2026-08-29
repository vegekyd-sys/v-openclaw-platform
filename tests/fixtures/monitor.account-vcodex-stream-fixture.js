const mergeStreamingText = (left, right) => `${left}${right}`;

function createFixture() {
	let sentIndependentBlockText = false;
	let partialUpdateQueue = Promise.resolve();
	let streamingStartPromise = null;
	let streaming = null;
	let streamText = "";

	const flushStreamingCardUpdate = (combined) => {
		partialUpdateQueue = partialUpdateQueue.then(async () => {
			if (streamingStartPromise) await streamingStartPromise;
			if (streaming?.isActive()) await streaming.update(combined);
		});
	};
	const queueStreamingUpdate = (nextText, options) => {
		if ((options?.mode ?? "snapshot") === "delta") streamText = `${streamText}${nextText}`;
		flushStreamingCardUpdate(streamText);
	};
	const resetStreamingState = () => {
		streaming = null;
		streamingStartPromise = null;
		partialUpdateQueue = Promise.resolve();
		streamText = "";
	};

	return { queueStreamingUpdate, resetStreamingState, sentIndependentBlockText };
}

void mergeStreamingText;
void createFixture;
