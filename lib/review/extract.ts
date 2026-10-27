import type { Message, Stance, TermId } from "@/lib/types";

function quote(body: string, pattern: RegExp): string | null {
  const match = pattern.exec(body);
  return match ? match[0] : null;
}

function stance(
  message: Message,
  term: TermId,
  value: string,
  kind: Stance["kind"],
  found: string,
  pendingApproval = false,
): Stance {
  return {
    term,
    party: message.from_role,
    messageId: message.id,
    quote: found,
    value,
    kind,
    at: message.sent_at,
    pendingApproval: pendingApproval || undefined,
  };
}

/** Explicit commitments only. Vague courtesy language never becomes a stance. */
export function extractStances(message: Message): Stance[] {
  if (message.source === "demo_outbound") return [];

  const body = message.body;
  const found: Stance[] = [];
  const acceptOffer = /I accept your updated offer/i.test(body);

  const substitute = quote(body, /substituting sample v1/i);
  if (substitute) {
    found.push(stance(message, "sample", "v1", "offer", substitute, true));
  } else {
    const confirmV2 = quote(body, /we confirm sample v2/i);
    const acceptV2 = quote(body, /we accept sample v2/i);
    const pleaseV2 = quote(body, /please use sample v2/i);
    const basedV2 = quote(body, /based on sample v2/i);
    const basedV1 = quote(body, /based on sample v1/i);
    const withV2 = quote(body, /with sample v2/i);
    if (confirmV2) found.push(stance(message, "sample", "v2", "accept", confirmV2));
    else if (acceptV2) found.push(stance(message, "sample", "v2", "accept", acceptV2));
    else if (acceptOffer && body.includes("sample v2")) {
      found.push(stance(message, "sample", "v2", "accept", "sample v2"));
    } else if (pleaseV2) found.push(stance(message, "sample", "v2", "request", pleaseV2));
    else if (basedV2) {
      found.push(stance(message, "sample", "v2", message.from_role === "seller" ? "offer" : "request", basedV2));
    } else if (basedV1) {
      found.push(stance(message, "sample", "v1", message.from_role === "buyer" ? "request" : "offer", basedV1));
    } else if (withV2) {
      found.push(stance(message, "sample", "v2", message.from_role === "seller" ? "offer" : "request", withV2));
    }
  }

  const london = quote(body, /delivery at LONDON-DEMO-ADDRESS by 20 November 2026/);
  const londonRequest = quote(body, /delivered to our London warehouse by 20 November 2026/);
  const londonImperative = quote(body, /deliver to our London warehouse by 20 November 2026/i);
  const shanghai = quote(body, /ready for collection in Shanghai on 20 November 2026/);
  if (london) {
    found.push(stance(message, "delivery", "london_delivery_2026-11-20", acceptOffer ? "accept" : "offer", london));
  } else if (londonRequest) {
    found.push(stance(message, "delivery", "london_delivery_2026-11-20", "request", londonRequest));
  } else if (londonImperative) {
    found.push(stance(message, "delivery", "london_delivery_2026-11-20", "request", londonImperative));
  }
  if (shanghai) {
    found.push(stance(message, "delivery", "shanghai_collection_2026-11-20", "offer", shanghai));
  }

  const setOffer = quote(body, /each including one box and one protective insert, at USD 2\.60 per set/);
  const setAccept = acceptOffer ? quote(body, /1,000 sets with protective inserts at USD 2\.60 per set/) : null;
  const insertsRequest = quote(body, /including the protective inserts/);
  const insertsWith = quote(body, /with protective inserts/i);
  if (setOffer) found.push(stance(message, "inserts", "box_plus_insert_usd_2.60", "offer", setOffer));
  if (setAccept) found.push(stance(message, "inserts", "box_plus_insert_usd_2.60", "accept", setAccept));
  if (!setOffer && !setAccept && insertsRequest) {
    found.push(stance(message, "inserts", "inserts_requested", "request", insertsRequest));
  } else if (!setOffer && !setAccept && insertsWith) {
    found.push(stance(message, "inserts", "inserts_requested", "request", insertsWith));
  }

  const shipOffer = quote(body, /Shipping is an additional USD 300/);
  const shipAccept = acceptOffer ? quote(body, /USD 300 shipping/) : null;
  if (shipOffer) found.push(stance(message, "shipping", "usd_300", "offer", shipOffer));
  if (shipAccept) found.push(stance(message, "shipping", "usd_300", "accept", shipAccept));

  const payment = quote(body, /30% deposit and 70% before dispatch/);
  if (payment) found.push(stance(message, "payment", "deposit_30_70", acceptOffer ? "accept" : "offer", payment));

  const acceptanceOffer = quote(body, /quantity and visible condition checked within 3 days of receipt/);
  const acceptanceAccept = acceptOffer ? quote(body, /3-day quantity and visible-condition check/) : null;
  if (acceptanceOffer) found.push(stance(message, "acceptance", "check_3day_visible", "offer", acceptanceOffer));
  if (acceptanceAccept) found.push(stance(message, "acceptance", "check_3day_visible", "accept", acceptanceAccept));

  const quantityRequest = quote(body, /1,000 custom gift packaging sets/);
  const quantityAccept = quote(body, /quantity 1,000 is confirmed/i);
  if (quantityRequest) found.push(stance(message, "quantity", "1000", "request", quantityRequest));
  if (quantityAccept) found.push(stance(message, "quantity", "1000", "accept", quantityAccept));

  const boxSentence = quote(body, /The boxes are USD 2\.40 each\./);
  const boxUnit = quote(body, /USD 2\.40 per box/);
  if (boxSentence) found.push(stance(message, "box_price", "usd_2.40_per_box", "offer", boxSentence));
  if (boxUnit) found.push(stance(message, "box_price", "usd_2.40_per_box", "offer", boxUnit));

  const subtotal = quote(body, /goods subtotal USD 2,600/i);
  if (subtotal) found.push(stance(message, "goods_subtotal", "usd_2600", acceptOffer ? "accept" : "offer", subtotal));

  const totalOffer = quote(body, /the order total is USD 2,900/);
  const totalAccept = acceptOffer ? quote(body, /total USD 2,900/) : null;
  if (totalOffer) found.push(stance(message, "order_total", "usd_2900", "offer", totalOffer));
  if (totalAccept) found.push(stance(message, "order_total", "usd_2900", "accept", totalAccept));

  return found.filter((item) => body.includes(item.quote));
}

export function stancesFromMessages(messages: Message[]): Stance[] {
  return messages.flatMap((message) => extractStances(message));
}

export function latestStance(stances: Stance[], term: TermId, party: Stance["party"]): Stance | undefined {
  for (let index = stances.length - 1; index >= 0; index -= 1) {
    const item = stances[index];
    if (item.term === term && item.party === party) return item;
  }
  return undefined;
}
