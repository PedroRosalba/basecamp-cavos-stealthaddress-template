export const STEALTH_REGISTRY_ABI = [
  {
    type: "function",
    name: "register_stealth_meta_address",
    inputs: [
      { name: "spending_pubkey_x", type: "felt" },
      { name: "spending_pubkey_y", type: "felt" },
      { name: "viewing_pubkey_x", type: "felt" },
      { name: "viewing_pubkey_y", type: "felt" },
      { name: "scheme_id", type: "felt" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "update_stealth_meta_address",
    inputs: [
      { name: "spending_pubkey_x", type: "felt" },
      { name: "spending_pubkey_y", type: "felt" },
      { name: "viewing_pubkey_x", type: "felt" },
      { name: "viewing_pubkey_y", type: "felt" },
      { name: "scheme_id", type: "felt" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "get_stealth_meta_address",
    inputs: [{ name: "user", type: "felt" }],
    outputs: [
      { name: "scheme_id", type: "felt" },
      { name: "spending_pubkey_x", type: "felt" },
      { name: "spending_pubkey_y", type: "felt" },
      { name: "viewing_pubkey_x", type: "felt" },
      { name: "viewing_pubkey_y", type: "felt" },
    ],
  },
  {
    type: "function",
    name: "has_meta_address",
    inputs: [{ name: "user", type: "felt" }],
    outputs: [{ name: "result", type: "felt" }],
  },
  {
    type: "function",
    name: "announce",
    inputs: [
      { name: "scheme_id", type: "felt" },
      { name: "ephemeral_pubkey_x", type: "felt" },
      { name: "ephemeral_pubkey_y", type: "felt" },
      { name: "stealth_address", type: "felt" },
      { name: "view_tag", type: "felt" },
      { name: "metadata", type: "felt" },
    ],
    outputs: [],
  },
];
