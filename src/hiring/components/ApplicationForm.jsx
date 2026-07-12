import { ArrowRight, FileText, Paperclip, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  APPLICATION_MAX_CV_BYTES,
  AVAILABILITY_OPTIONS
} from "../../../shared/hiring/applicationSchema.js";

const STORAGE_KEY = "auralis:hiring:application";
const NOOP = () => {};
const EMPTY_ROLES = Object.freeze([]);
const EMPTY_FORM = {
  roleSlug: "",
  fullName: "",
  email: "",
  country: "",
  timeZone: "",
  profileUrl: "",
  availability: "",
  privacyAccepted: false
};

function supportedCountries() {
  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    const names = new Set();
    for (let first = 65; first <= 90; first += 1) {
      for (let second = 65; second <= 90; second += 1) {
        const code = String.fromCharCode(first, second);
        const name = displayNames.of(code);
        if (name && name !== code && name !== "Unknown Region") names.add(name);
      }
    }
    return [...names].sort((left, right) => left.localeCompare(right));
  } catch {
    return ["Georgia", "United Kingdom", "United States"];
  }
}

function supportedTimeZones() {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "Asia/Tbilisi", "Europe/London", "America/New_York"];
  }
}

const COUNTRIES = supportedCountries();
const TIME_ZONES = supportedTimeZones();

function readStoredFields() {
  try {
    return { ...EMPTY_FORM, ...JSON.parse(sessionStorage.getItem(STORAGE_KEY)) };
  } catch {
    return EMPTY_FORM;
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function createIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `submission-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function errorMessage(code) {
  const messages = {
    CAMPAIGN_UNAVAILABLE:
      "This private application link is no longer available. Request a current link from Auralis.",
    ROLE_UNAVAILABLE:
      "That role is no longer accepting applications. Choose another role to continue.",
    CV_UPLOAD_FAILED: "The CV could not be uploaded. Your other details are still here.",
    INVALID_CV: "The uploaded CV could not be confirmed. Choose the PDF again.",
    INVALID_APPLICATION: "Review the marked fields and try again."
  };
  return messages[code] ?? "The application could not be submitted. Please try again.";
}

export default function ApplicationForm({
  roles: providedRoles = EMPTY_ROLES,
  role: fixedRole = null,
  campaign = null,
  client,
  onSubmitted = NOOP,
  onRoleChange = NOOP
}) {
  const formId = useId();
  const errorRef = useRef(null);
  const idempotencyKey = useRef(null);
  const [fields, setFields] = useState(readStoredFields);
  const [cvFile, setCvFile] = useState(null);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("editing");
  const [formError, setFormError] = useState("");
  const roles = fixedRole ? [fixedRole] : providedRoles;
  const role = fixedRole ?? roles.find((candidate) => candidate.slug === fields.roleSlug) ?? null;

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fields));
  }, [fields]);

  useEffect(() => {
    if (status === "error") errorRef.current?.focus();
  }, [status]);

  useEffect(() => {
    onRoleChange(role);
  }, [onRoleChange, role]);

  function updateField(event) {
    const { name, type, checked, value } = event.target;
    setFields((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value
    }));
    setErrors((current) => ({ ...current, [name]: undefined }));
    if (status === "error") setStatus("editing");
  }

  function updateCv(event) {
    const file = event.target.files?.[0] ?? null;
    const valid =
      file &&
      file.type === "application/pdf" &&
      /\.pdf$/i.test(file.name) &&
      file.size > 0 &&
      file.size <= APPLICATION_MAX_CV_BYTES;
    setCvFile(valid ? file : null);
    setErrors((current) => ({
      ...current,
      cv: valid ? undefined : "Upload a PDF up to 5 MB."
    }));
  }

  function validate() {
    const next = {};
    if (!role) next.roleSlug = "Choose the role you are applying for.";
    if (fields.fullName.trim().length < 2) next.fullName = "Enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(fields.email.trim())) {
      next.email = "Enter a valid email address.";
    }
    if (!fields.country) next.country = "Choose your country.";
    if (!fields.timeZone) next.timeZone = "Choose your time zone.";
    if (role?.portfolioRequired && !fields.profileUrl.trim()) {
      next.profileUrl = "Add a portfolio, LinkedIn, or GitHub URL.";
    } else if (fields.profileUrl && !isHttpUrl(fields.profileUrl)) {
      next.profileUrl = "Use a valid http or https URL.";
    }
    if (!fields.availability) next.availability = "Choose your weekly availability.";
    if (!cvFile) next.cv = "Upload a PDF up to 5 MB.";
    if (!fields.privacyAccepted) {
      next.privacyAccepted = "Accept the privacy notice to continue.";
    }
    return next;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (status === "uploading" || status === "submitting") return;

    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setFormError("Review the marked fields before continuing.");
      setStatus("error");
      return;
    }

    setErrors({});
    setFormError("");
    idempotencyKey.current ??= createIdempotencyKey();
    try {
      setStatus("uploading");
      const upload = await client.createUploadUrl({
        ...(campaign ? { campaignId: campaign.id } : { roleSlug: role.slug }),
        email: fields.email.trim().toLowerCase(),
        fileName: cvFile.name,
        mimeType: cvFile.type,
        size: cvFile.size,
        website
      });
      await client.uploadCv(upload, cvFile);

      setStatus("submitting");
      const result = await client.submitApplication(
        {
          roleSlug: role.slug,
          ...(campaign ? { campaignToken: campaign.token } : {}),
          website,
          payload: {
            fullName: fields.fullName.trim(),
            email: fields.email.trim().toLowerCase(),
            country: fields.country,
            timeZone: fields.timeZone,
            profileUrl: fields.profileUrl.trim(),
            availability: fields.availability,
            cvObjectKey: upload.objectKey,
            cvMimeType: cvFile.type,
            cvSize: cvFile.size,
            privacyAccepted: fields.privacyAccepted
          }
        },
        idempotencyKey.current
      );
      sessionStorage.removeItem(STORAGE_KEY);
      setStatus("submitted");
      onSubmitted(result);
    } catch (error) {
      setFormError(errorMessage(error?.code));
      setStatus("error");
    }
  }

  const pending = status === "uploading" || status === "submitting";
  const buttonLabel =
    status === "uploading"
      ? "Uploading CV"
      : status === "submitting"
        ? "Submitting application"
        : "Submit application";

  return (
    <form className="hiring-form" onSubmit={handleSubmit} noValidate>
      <input
        className="hiring-honeypot"
        name="website"
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
        autoComplete="off"
        tabIndex="-1"
        aria-hidden="true"
      />
      {formError ? (
        <div className="hiring-error-summary" role="alert" tabIndex="-1" ref={errorRef}>
          <span>Application not sent</span>
          <p>{formError}</p>
        </div>
      ) : null}

      <fieldset className="hiring-fieldset" disabled={pending}>
        <legend><i aria-hidden="true" />Your details</legend>

        {!fixedRole ? (
          <div className="hiring-field hiring-field-wide">
            <label htmlFor={`${formId}-role`}>Role</label>
            <select
              id={`${formId}-role`}
              name="roleSlug"
              value={fields.roleSlug}
              onChange={updateField}
              aria-invalid={Boolean(errors.roleSlug)}
            >
              <option value="">Select the role you are applying for</option>
              {roles.map((availableRole) => (
                <option key={availableRole.slug} value={availableRole.slug}>
                  {availableRole.title}
                </option>
              ))}
            </select>
            {errors.roleSlug ? <small>{errors.roleSlug}</small> : null}
          </div>
        ) : null}

        <div className="hiring-field hiring-field-wide">
          <label htmlFor={`${formId}-name`}>Full name</label>
          <input
            id={`${formId}-name`}
            name="fullName"
            autoComplete="name"
            value={fields.fullName}
            onChange={updateField}
            aria-invalid={Boolean(errors.fullName)}
          />
          {errors.fullName ? <small>{errors.fullName}</small> : null}
        </div>

        <div className="hiring-field hiring-field-wide">
          <label htmlFor={`${formId}-email`}>Email address</label>
          <input
            id={`${formId}-email`}
            name="email"
            type="email"
            autoComplete="email"
            value={fields.email}
            onChange={updateField}
            aria-invalid={Boolean(errors.email)}
          />
          {errors.email ? <small>{errors.email}</small> : null}
        </div>

        <div className="hiring-field">
          <label htmlFor={`${formId}-country`}>Country</label>
          <select
            id={`${formId}-country`}
            name="country"
            autoComplete="country-name"
            value={fields.country}
            onChange={updateField}
            aria-invalid={Boolean(errors.country)}
          >
            <option value="">Select country</option>
            {COUNTRIES.map((country) => (
              <option key={country} value={country}>{country}</option>
            ))}
          </select>
          {errors.country ? <small>{errors.country}</small> : null}
        </div>

        <div className="hiring-field">
          <label htmlFor={`${formId}-timezone`}>Time zone</label>
          <select
            id={`${formId}-timezone`}
            name="timeZone"
            value={fields.timeZone}
            onChange={updateField}
            aria-invalid={Boolean(errors.timeZone)}
          >
            <option value="">Select time zone</option>
            {TIME_ZONES.map((timeZone) => (
              <option key={timeZone} value={timeZone}>{timeZone}</option>
            ))}
          </select>
          {errors.timeZone ? <small>{errors.timeZone}</small> : null}
        </div>

        <div className="hiring-field hiring-field-wide">
          <label htmlFor={`${formId}-profile`}>
            Portfolio, LinkedIn, or GitHub URL
            <span>{role?.portfolioRequired ? "Required" : "Optional"}</span>
          </label>
          <input
            id={`${formId}-profile`}
            name="profileUrl"
            type="url"
            inputMode="url"
            autoComplete="url"
            value={fields.profileUrl}
            onChange={updateField}
            aria-invalid={Boolean(errors.profileUrl)}
          />
          {errors.profileUrl ? <small>{errors.profileUrl}</small> : null}
        </div>

        <div className="hiring-field hiring-field-wide">
          <label htmlFor={`${formId}-availability`}>Weekly availability</label>
          <select
            id={`${formId}-availability`}
            name="availability"
            value={fields.availability}
            onChange={updateField}
            aria-invalid={Boolean(errors.availability)}
          >
            <option value="">Select hours per week</option>
            {AVAILABILITY_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          {errors.availability ? <small>{errors.availability}</small> : null}
        </div>
      </fieldset>

      <fieldset className="hiring-fieldset hiring-cv-fieldset" disabled={pending}>
        <legend><i aria-hidden="true" />CV / Resume</legend>
        <label className="hiring-upload" htmlFor={`${formId}-cv`}>
          <span className="hiring-upload-icon" aria-hidden="true">
            {cvFile ? <FileText size={20} /> : <Paperclip size={20} />}
          </span>
          <span className="hiring-upload-name">
            {cvFile ? cvFile.name : "PDF only · 5 MB maximum"}
          </span>
          <span className="hiring-upload-action">
            <Upload size={15} aria-hidden="true" />
            {cvFile ? "Replace" : "Upload"}
          </span>
        </label>
        <input
          className="hiring-file-input"
          id={`${formId}-cv`}
          aria-label="CV / Resume"
          type="file"
          accept=".pdf,application/pdf"
          onChange={updateCv}
        />
        {errors.cv ? <small className="hiring-file-error">{errors.cv}</small> : null}
      </fieldset>

      <div className="hiring-form-footer">
        <label className="hiring-consent">
          <input
            type="checkbox"
            name="privacyAccepted"
            checked={fields.privacyAccepted}
            onChange={updateField}
            aria-label="I agree to the privacy notice"
          />
          <span>
            I agree to the privacy notice. <a href="/privacy" target="_blank" rel="noreferrer">Read it here</a>
          </span>
        </label>
        {errors.privacyAccepted ? (
          <small className="hiring-consent-error">{errors.privacyAccepted}</small>
        ) : null}

        <button className="hiring-submit" type="submit" disabled={pending}>
          <span>{buttonLabel}</span>
          <ArrowRight size={21} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
