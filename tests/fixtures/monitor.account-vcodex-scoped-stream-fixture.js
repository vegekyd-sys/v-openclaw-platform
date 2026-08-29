function createFeishuReplyDispatcher(params) {
	const { chatId } = params;
	const account = { config: params.accountConfig };
	const renderMode = account.config?.renderMode ?? "auto";
	return renderMode;
}

if (process.argv[2] === "probe") {
	process.stdout.write(JSON.stringify([
		createFeishuReplyDispatcher({ chatId: "oc_vcodex", accountConfig: { renderMode: "auto" } }),
		createFeishuReplyDispatcher({ chatId: "oc_regular", accountConfig: { renderMode: "raw" } }),
		createFeishuReplyDispatcher({ chatId: "not-a-chat", accountConfig: {} })
	]));
}
