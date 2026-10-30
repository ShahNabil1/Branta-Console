// Maps a passkey's AAGUID (authenticator model ID) to a recognisable
// provider name. Source: passkey-authenticator-aaguids community list.
export type PasskeyProvider = {
  name: string;
  kind: "google" | "apple" | "microsoft" | "password_manager" | "security_key" | "generic";
};

const AAGUIDS: Record<string, PasskeyProvider> = {
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": { name: "Google Password Manager", kind: "google" },
  "adce0002-35bc-c60a-648b-0b25f1f05503": { name: "Chrome on Mac", kind: "google" },
  "b5397666-4885-aa6b-cebf-e52262a439a2": { name: "Chromium Browser", kind: "google" },
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": { name: "iCloud Keychain", kind: "apple" },
  "dd4ec289-e01d-41c9-bb89-70fa845d4bf2": { name: "iCloud Keychain (Managed)", kind: "apple" },
  "08987058-cadc-4b81-b6e1-30de50dcbe96": { name: "Windows Hello", kind: "microsoft" },
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": { name: "Windows Hello", kind: "microsoft" },
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": { name: "Windows Hello", kind: "microsoft" },
  "bada5566-a7aa-401f-bd96-45619a55120d": { name: "1Password", kind: "password_manager" },
  "d548826e-79b4-db40-a3d8-11116f7e8349": { name: "Bitwarden", kind: "password_manager" },
  "531126d6-e717-415c-9320-3d9aa6981239": { name: "Dashlane", kind: "password_manager" },
  "b84e4048-15dc-4dd0-8640-f4f60813c8af": { name: "NordPass", kind: "password_manager" },
  "0ea242b4-43c4-4a1b-8b17-dd6d0b6baec6": { name: "Keeper", kind: "password_manager" },
  "f3809540-7f14-49c1-a8b3-8f813b225541": { name: "Enpass", kind: "password_manager" },
  "53414d53-554e-4700-0000-000000000000": { name: "Samsung Pass", kind: "password_manager" },
  "891494da-2c90-4d31-a9cd-4eab0aed1309": { name: "Proton Pass", kind: "password_manager" },
  "50726f74-6f6e-5061-7373-50726f746f6e": { name: "Proton Pass", kind: "password_manager" },
  "cb69481e-8ff7-4039-93ec-0a2729a154a8": { name: "YubiKey 5", kind: "security_key" },
  "ee882879-721c-4913-9775-3dfcce97072a": { name: "YubiKey 5", kind: "security_key" },
  "fa2b99dc-9e39-4257-8f92-4a30d23c4118": { name: "YubiKey 5 NFC", kind: "security_key" },
  "2fc0579f-8113-47ea-b116-bb5a8db9202a": { name: "YubiKey 5 NFC", kind: "security_key" },
  "c5ef55ff-ad9a-4b9f-b580-adebafe026d0": { name: "YubiKey 5Ci", kind: "security_key" },
  "a4e9fc6d-4cbe-4758-b8ba-37598bb5bbaa": { name: "Security Key by Yubico", kind: "security_key" },
};

export function getPasskeyProvider(p: {
  aaguid?: string | null;
  device_type?: string | null;
  transports?: string[] | null;
}): PasskeyProvider {
  const id = (p.aaguid ?? "").toLowerCase();
  if (id && AAGUIDS[id]) return AAGUIDS[id];
  const t = p.transports ?? [];
  if (t.includes("usb") || t.includes("nfc")) return { name: "Security key", kind: "security_key" };
  if (p.device_type === "multiDevice") return { name: "Synced passkey", kind: "generic" };
  return { name: "Device passkey", kind: "generic" };
}
