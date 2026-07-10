import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM;
const recipient = process.env.HIRING_RECRUITER_EMAIL;

if (!apiKey || !from || !recipient) {
  throw new Error(
    "RESEND_API_KEY, RESEND_FROM, and HIRING_RECRUITER_EMAIL are required."
  );
}

const resend = new Resend(apiKey);
const { data, error } = await resend.emails.send({
  from,
  to: [recipient],
  subject: "Auralis hiring notifications verified",
  text: "The Auralis hiring application can deliver internal notifications to this inbox."
});

if (error || !data?.id) {
  throw new Error("Resend rejected the internal notification.");
}

console.log(`Resend verified. Test message queued as ${data.id}.`);
