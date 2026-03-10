export const STEALTH_FACTORY_ABI = [
  {
    type: "function",
    name: "deploy_stealth_account",
    inputs: [
      { name: "stealth_pubkey_x", type: "felt" },
      { name: "stealth_pubkey_y", type: "felt" },
      { name: "salt", type: "felt" },
    ],
    outputs: [{ name: "address", type: "felt" }],
  },
];
