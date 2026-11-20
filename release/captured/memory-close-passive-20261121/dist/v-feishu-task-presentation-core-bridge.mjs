// Use the core's durable delivery ownership and settlement API. The presentation
// journal stores this identity so a transport retry also settles restart recovery.
import {a as resolvePendingFinalDeliveryCompletion} from './pending-final-delivery-CNQYsZ37.js';
import {t as completeDurableDelivery} from './delivery-completion-Do3nBV6b.js';
globalThis[Symbol.for('openclaw.v.boundTaskDeliveryCompletion.v1')]={
 resolve:resolvePendingFinalDeliveryCompletion,
 complete:async(completion,receipt)=>completeDurableDelivery(completion,{messageId:receipt.messageId},process.env.OPENCLAW_STATE_DIR),
};
