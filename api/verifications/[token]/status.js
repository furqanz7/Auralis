import {
  requireMethod,
  sendHttpError,
  setPrivateHeaders
} from "../../_lib/http.js";
import {
  readStrictVerificationBody,
  readVerificationToken,
  wisePaymentReportBodySchema
} from "../../_lib/verificationHttp.js";
import {
  getVerificationStatusRuntimeService
} from "../../_lib/verificationRuntime.js";
import {
  getWisePaymentReportRuntimeService
} from "../../_lib/wisePaymentReportRuntime.js";

export function createVerificationStatusHandler(service) {
  return async function verificationStatusHandler(request, response) {
    setPrivateHeaders(response);
    try {
      requireMethod(request, response, "GET");
      const result = await service.getStatus({
        verificationToken: readVerificationToken(request)
      });
      return response.status(200).json(result);
    } catch (error) {
      return sendHttpError(response, error);
    }
  };
}

export function createWisePaymentReportHandler(service) {
  return async function wisePaymentReportHandler(request, response) {
    setPrivateHeaders(response);
    try {
      requireMethod(request, response, "POST");
      const verificationToken = readVerificationToken(request);
      const { payerName } = readStrictVerificationBody(
        request,
        wisePaymentReportBodySchema,
        "PAYMENT_REPORT_BODY_INVALID"
      );
      const result = await service.reportPayment({
        verificationToken,
        payerName
      });
      return response.status(200).json(result);
    } catch (error) {
      return sendHttpError(response, error);
    }
  };
}

export default async function handler(request, response) {
  if (request.query?.action === "payment-report") {
    return createWisePaymentReportHandler(
      getWisePaymentReportRuntimeService()
    )(request, response);
  }
  return createVerificationStatusHandler(
    getVerificationStatusRuntimeService()
  )(request, response);
}
