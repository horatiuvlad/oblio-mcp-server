/**
 * Zod schemas for every tool's input. Tool modules spread the exported raw
 * shapes into registerTool({ inputSchema }). Nested object schemas are
 * exported separately for reuse and testing.
 *
 * Field semantics mirror the Oblio API (https://www.oblio.eu/api).
 */
import { z } from "zod";

/** 0/1 flag as the Oblio API expects. */
const boolFlag = z.union([z.literal(0), z.literal(1)]);

export const docTypeSchema = z
  .enum(["invoice", "proforma", "notice"])
  .describe('Document type: "invoice" (factura), "proforma", or "notice" (aviz).');

export const collectTypeSchema = z
  .enum([
    "Chitanta",
    "Bon fiscal",
    "Bon fiscal card",
    "Alta incasare numerar",
    "Ordin de plata",
    "Mandat postal",
    "Card",
    "CEC",
    "Bilet ordin",
    "Alta incasare banca",
    "Ramburs",
  ])
  .describe("Payment method as accepted by Oblio.");

export const clientSchema = z
  .object({
    cif: z.string().optional().describe("Client CIF (companies) or CNP (individuals)."),
    name: z.string().describe("Client company or person name."),
    rc: z.string().optional().describe("Trade Register number (Registrul Comertului)."),
    code: z.string().optional().describe("Internal client code."),
    address: z.string().optional().describe("Street address."),
    state: z.string().optional().describe("County / Judet."),
    city: z.string().optional().describe("City."),
    country: z.string().optional().describe("Country."),
    iban: z.string().optional().describe("Client IBAN."),
    bank: z.string().optional().describe("Client bank name."),
    email: z.string().optional().describe("Client email."),
    phone: z.string().optional().describe("Client phone."),
    contact: z.string().optional().describe("Contact person."),
    vatPayer: boolFlag.optional().describe("1 if the client is a VAT payer, else 0."),
    save: boolFlag
      .optional()
      .describe("1 to create/update this client in Oblio, 0 to leave untouched. Default 0."),
    autocomplete: boolFlag
      .optional()
      .describe("1 to auto-fill client data from Romanian registries by CIF. Default 0."),
  })
  .describe("Client (buyer) details. Only name is strictly required.");

export const productSchema = z
  .object({
    name: z.string().describe("Product or service name."),
    code: z.string().optional().describe("Product code / SKU."),
    description: z.string().optional().describe("Line description."),
    price: z.number().describe("Unit price."),
    measuringUnit: z.string().optional().describe('Unit of measure, e.g. "buc", "ore", "ZILE".'),
    currency: z.string().optional().describe('Currency code, e.g. "RON", "EUR", "USD".'),
    vatName: z.string().optional().describe('VAT rate name, e.g. "Normala", "SDD", "Scutita".'),
    vatPercentage: z.number().optional().describe("VAT percentage, e.g. 21."),
    vatIncluded: boolFlag.optional().describe("1 if price already includes VAT, else 0."),
    quantity: z.number().optional().describe("Quantity. Default 1."),
    productType: z
      .enum(["Marfa", "Serviciu", "Produs finit", "Materie prima", "Materiale", "Ambalaje"])
      .optional()
      .describe("Product classification. Default Serviciu-like behaviour when omitted."),
    management: z.string().optional().describe("Management / gestiune name (stock only)."),
  })
  .describe("An invoice/proforma line item.");

export const collectSchema = z
  .object({
    type: collectTypeSchema,
    seriesName: z.string().optional().describe('Receipt series (required when type is "Chitanta").'),
    documentNumber: z
      .string()
      .optional()
      .describe('Payment document number (used when type is not "Chitanta").'),
    value: z.number().optional().describe("Amount collected. Defaults to the invoice total."),
    issueDate: z.string().optional().describe("Payment date YYYY-MM-DD. Defaults to today."),
    mentions: z.string().optional().describe("Free-text payment notes."),
  })
  .describe("A payment collection.");

/** data payload shared by createDoc. */
export const documentDataSchema = z.object({
  cif: z.string().optional().describe("Issuing company CIF. Falls back to the configured CIF."),
  client: clientSchema,
  issueDate: z.string().optional().describe("Issue date YYYY-MM-DD. Defaults to today."),
  dueDate: z.string().optional().describe("Due date YYYY-MM-DD."),
  deliveryDate: z.string().optional().describe("Delivery date YYYY-MM-DD."),
  seriesName: z.string().describe("Document series name (e.g. FCT, PROF)."),
  language: z.string().optional().describe('Document language, e.g. "RO", "EN".'),
  currency: z.string().optional().describe('Document currency, e.g. "RON", "EUR".'),
  products: z.array(productSchema).min(1).describe("At least one line item."),
  issuerName: z.string().optional(),
  issuerId: z.string().optional(),
  noticeNumber: z.string().optional().describe("Linked delivery notice number."),
  internalNote: z.string().optional(),
  deputyName: z.string().optional(),
  selesAgent: z.string().optional(),
  mentions: z.string().optional().describe("Notes printed on the document."),
  value: z.number().optional(),
  workStation: z.string().optional().describe('Work station / punct de lucru. Default "Sediu".'),
  useStock: boolFlag.optional().describe("1 to deduct from stock, else 0."),
  collect: collectSchema.optional().describe("Optional inline payment recorded with the document."),
  referenceDocument: z
    .object({
      type: z.string(),
      seriesName: z.string(),
      number: z.string(),
    })
    .optional()
    .describe("Source document to convert from (e.g. proforma → invoice)."),
});

// ── raw shapes spread into registerTool({ inputSchema }) ────────────────────

export const createDocumentShape = {
  type: docTypeSchema,
  data: documentDataSchema.describe("Document body."),
  idempotencyKey: z
    .string()
    .optional()
    .describe(
      "Optional caller-supplied key. If the same key was already used in this " +
        "server process, the previous result is returned instead of issuing a " +
        "second document. Guards against accidental double-issue on retries."
    ),
};

export const getDocumentShape = {
  type: docTypeSchema,
  seriesName: z.string().describe("Document series name."),
  number: z.number().describe("Document number within the series."),
};

/** -1 = all, 0 = no, 1 = yes — Oblio's ternary list flags. */
const ternaryFlag = z.union([z.literal(-1), z.literal(0), z.literal(1)]);

/** Client sub-filter for list_documents, exactly the keys the API accepts. */
export const listClientFilterSchema = z
  .object({
    cif: z.string().optional().describe("Client CIF."),
    email: z.string().optional().describe("Client email."),
    phone: z.string().optional().describe("Client phone."),
    code: z.string().optional().describe("Internal client code."),
  })
  .describe("Filter by client identity (any combination of cif/email/phone/code).");

export const listDocumentsShape = {
  type: docTypeSchema,
  id: z.number().optional().describe("Filter by Oblio document id."),
  seriesName: z.string().optional().describe("Filter by series."),
  number: z.number().optional().describe("Filter by document number."),
  draft: ternaryFlag.optional().describe("Draft filter: -1 all, 0 issued only, 1 drafts only."),
  canceled: ternaryFlag.optional().describe("Cancelled filter: -1 all, 0 active only, 1 cancelled only."),
  collected: ternaryFlag.optional().describe("Payment filter: -1 all, 0 uncollected, 1 collected."),
  client: listClientFilterSchema.optional(),
  issuedAfter: z.string().optional().describe("Issue date lower bound YYYY-MM-DD."),
  issuedBefore: z.string().optional().describe("Issue date upper bound YYYY-MM-DD."),
  withProducts: boolFlag.optional().describe("1 to include line items in the response."),
  withCollects: boolFlag.optional().describe("1 to include payment collections."),
  withEinvoiceStatus: boolFlag.optional().describe("1 to include e-Factura (SPV) status."),
  orderBy: z.enum(["id", "issueDate", "number"]).optional().describe("Sort field."),
  orderDir: z.enum(["ASC", "DESC"]).optional().describe("Sort direction."),
  limitPerPage: z.number().int().min(1).max(100).optional().describe("Results per page (max 100)."),
  offset: z.number().int().min(0).optional().describe("Pagination offset."),
};

export const cancelDocumentShape = {
  type: docTypeSchema,
  seriesName: z.string().describe("Document series name."),
  number: z.number().describe("Document number."),
};

export const restoreDocumentShape = cancelDocumentShape;

export const deleteDocumentShape = {
  type: docTypeSchema,
  seriesName: z.string().describe("Document series name."),
  number: z.number().describe("Document number. Only the last in a series can be deleted."),
};

export const collectPaymentShape = {
  seriesName: z.string().describe("Invoice series name."),
  number: z.number().describe("Invoice number."),
  collect: collectSchema,
};

export const nomenclatureShape = {
  type: z
    .enum(["companies", "clients", "products", "vat_rates", "series", "languages", "management"])
    .describe("Reference data set to fetch."),
  name: z.string().optional().describe("Optional name filter (clients/products)."),
  filters: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .optional()
    .describe("Extra query filters, e.g. { offset: 250, cif: 'RO123' }."),
};

export const createEinvoiceShape = {
  seriesName: z.string().describe("Invoice series name to submit to SPV."),
  number: z.number().describe("Invoice number."),
};

export const getEinvoiceShape = createEinvoiceShape;

export const setCifShape = {
  cif: z.string().describe("Company CIF to use for subsequent requests, e.g. RO45079498."),
};

export const webhookTopicSchema = z
  .enum([
    "stock",
    "Invoice/SaveDraft",
    "Proforma/SaveDraft",
    "Notice/SaveDraft",
    "TaxReceipt/SaveDraft",
    "Invoice/Update",
    "Proforma/Update",
    "Notice/Update",
    "Invoice/Cancel",
    "Proforma/Cancel",
    "Notice/Cancel",
    "TaxReceipt/Cancel",
    "Collect/Inserted",
  ])
  .describe(
    'Event to subscribe to: "stock" (stock changes), "<Doc>/SaveDraft" (draft ' +
      'saved), "<Doc>/Update", "<Doc>/Cancel", or "Collect/Inserted" (payment ' +
      "recorded), where <Doc> is Invoice, Proforma, Notice or TaxReceipt."
  );

export const createWebhookShape = {
  topic: webhookTopicSchema,
  endpoint: z
    .string()
    .url()
    .describe(
      "URL Oblio notifies on the subscribed event. It must respond with " +
        'status 200 and echo the base64-encoded value of the "X-Oblio-Request-Id" ' +
        "request header."
    ),
  cif: z.string().optional().describe("Company CIF. Falls back to the configured CIF."),
};

export const deleteWebhookShape = {
  id: z
    .union([z.string(), z.number()])
    .describe("Webhook subscription id, as returned by create_webhook or list_webhooks."),
};
