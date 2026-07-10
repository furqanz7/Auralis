import { Resend } from "resend";

export function createLiveEmailClient(env, ResendClient = Resend) {
  return new ResendClient(env.RESEND_API_KEY);
}
