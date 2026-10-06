import { auth as googleAuth, people as peopleApi, people_v1 } from "@googleapis/people";

// The standalone People API client: the full `googleapis` package bundles
// every Google API (200+ MB) while only this one is used.
export type OAuth2Client = InstanceType<typeof googleAuth.OAuth2>;

import { SimpleContact } from "./interfaces";
import { GoogleAccount } from "../../interfaces/api";
import { Base64 } from "./types";

const pageSize: number = 250;

export function generateGoogleAuthUrl(
  redirectUri: string,
  state: string
): string {
  const oauth2Client = new googleAuth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: "https://www.googleapis.com/auth/contacts",
    state,
    prompt: "consent",
  });
}

export async function getOAuth2ClientFromCode(
  code: string,
  redirectUri: string
): Promise<OAuth2Client> {
  const oauth2Client = new googleAuth.OAuth2({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
    // Tests stand in for Google's token endpoint.
    ...(process.env.SCS_GOOGLE_TOKEN_ENDPOINT && { endpoints: { oauth2TokenUrl: process.env.SCS_GOOGLE_TOKEN_ENDPOINT } }),
  });
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
}

export async function listContacts(
  auth: OAuth2Client
): Promise<SimpleContact[]> {
  const people: people_v1.People = peopleApi({ version: "v1", auth });

  let simpleContacts: SimpleContact[] = [];
  let nextPageToken = "";

  do {
    const res = await people.people.connections.list({
      resourceName: "people/me",
      pageSize: pageSize,
      personFields: "names,emailAddresses,phoneNumbers,photos,urls",
      pageToken: nextPageToken,
    });

    nextPageToken = res.data.nextPageToken!;
    const connections = res.data.connections;

    // Contacts with something to match on: a number, an email or a link.
    const contacts = (connections ?? [])
      .filter((connection) => connection.phoneNumbers || connection.emailAddresses || connection.urls)
      .map(
        (connection) =>
          <SimpleContact>{
            id: connection.resourceName,
            name: connection.names?.find((name) => name.displayName)?.displayName,
            // Keep the E.164 `canonicalForm` when Google could parse the number,
            // otherwise fall back to the raw `value` so numbers saved in a local
            // format (no +CC) are normalized later against the user's region
            // instead of being silently dropped.
            numbers: (connection.phoneNumbers ?? []).map(
                (phoneNumber) => phoneNumber.canonicalForm ?? phoneNumber.value
              )
              .filter((number): number is string => Boolean(number)),
            emails: (connection.emailAddresses ?? [])
              .map((email) => email.value)
              .filter((email): email is string => Boolean(email)),
            hasPhoto: !connection.photos // Check if photos contain only the "default" photo
              ?.map((photo) => photo.default)
              .every((v) => v === true),
            photoUrl: connection.photos?.find((photo) => photo.metadata?.primary)?.url,
            urls: (connection.urls ?? []).map((u) => u.value).filter((u): u is string => Boolean(u)),
          }
      );

    simpleContacts = simpleContacts.concat(contacts);
  } while (nextPageToken);

  return simpleContacts;
}

export async function updateContactPhoto(
  auth: OAuth2Client,
  resourceName: string,
  photo: Base64
): Promise<void> {
  const people: people_v1.People = peopleApi({ version: "v1", auth });

  // Errors propagate so the sync can count them per contact.
  await people.people.updateContactPhoto({
    resourceName: resourceName,
    requestBody: { photoBytes: photo },
  });
}

export async function deleteContactPhoto(auth: OAuth2Client, resourceName: string): Promise<void> {
  const people = peopleApi({ version: "v1", auth });
  await people.people.deleteContactPhoto({ resourceName });
}

/** The contact's current photo, or null when it has none (or only Google's default). */
export async function downloadContactPhoto(contact: SimpleContact): Promise<Base64 | null> {
  if (!contact.hasPhoto || !contact.photoUrl) return null;
  const response = await fetch(contact.photoUrl);
  if (!response.ok) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  return bytes.length ? bytes.toString("base64") : null;
}

/** The signed-in account and the size of its address book. */
export async function getAccountSummary(auth: OAuth2Client): Promise<GoogleAccount> {
  const people = peopleApi({ version: "v1", auth });
  const [me, connections] = await Promise.all([
    people.people.get({ resourceName: "people/me", personFields: "names,emailAddresses,photos" }),
    people.people.connections.list({ resourceName: "people/me", pageSize: 1, personFields: "names" }),
  ]);
  return {
    email: me.data.emailAddresses?.find((e) => e.metadata?.primary)?.value ?? me.data.emailAddresses?.[0]?.value ?? undefined,
    name: me.data.names?.[0]?.displayName ?? undefined,
    photoUrl: me.data.photos?.find((p) => !p.default)?.url ?? undefined,
    totalContacts: connections.data.totalItems ?? undefined,
  };
}

/** A client for previously saved tokens (desktop app restart). */
export function oauth2ClientFromTokens(tokens: object): OAuth2Client {
  const oauth2Client = new googleAuth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
}
