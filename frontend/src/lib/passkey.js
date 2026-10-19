import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

export const isMobile = () => !!navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
export const supportaBiometria = () => !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);

export const deviceId = () => {
  let id = localStorage.getItem("geb_device_id");
  if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem("geb_device_id", id); }
  return id;
};
const deviceNome = () => { const ua = navigator.userAgent; return /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : "Telefono"; };

// client = istanza axios (api o mobileApi()), base = "/webauthn"
export async function statoBiometria(client, base = "/webauthn") {
  const r = await client.get(`${base}/status`, { params: { device_id: deviceId() } });
  return r.data;
}

export async function registraBiometria(client, base = "/webauthn") {
  const o = await client.post(`${base}/register/options`);
  const att = await startRegistration({ optionsJSON: typeof o.data === "string" ? JSON.parse(o.data) : o.data });
  await client.post(`${base}/register/complete`, { ...att, device_id: deviceId(), device_nome: deviceNome() });
}

export async function sbloccaBiometria(client, base = "/webauthn") {
  const o = await client.post(`${base}/unlock/options`, { device_id: deviceId() });
  const ass = await startAuthentication({ optionsJSON: typeof o.data === "string" ? JSON.parse(o.data) : o.data });
  await client.post(`${base}/unlock/complete`, { ...ass, device_id: deviceId() });
}

const KEY = "geb_sbloccato";
export const isSbloccato = () => sessionStorage.getItem(KEY) === "1";
export const segnaSbloccato = () => sessionStorage.setItem(KEY, "1");
export const resetSblocco = () => sessionStorage.removeItem(KEY);
