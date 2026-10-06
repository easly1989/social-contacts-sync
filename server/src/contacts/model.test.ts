import test from "node:test";
import assert from "node:assert/strict";

import { Person } from "../cleanup/people";
import { duplicatePerson, newPerson, parseInput, personUpdate, photoKey, toContact, withLabel } from "./model";

const linked = { metadata: { source: { type: "PROFILE" } } };
const person: Person = {
  resourceName: "people/c1",
  etag: "e1",
  metadata: { sources: [{ type: "CONTACT", id: "c1", etag: "e1", updateTime: "2026-10-01T10:00:00Z" }] },
  names: [{ displayName: "Davide Gallo", givenName: "Davide", familyName: "Gallo", middleName: "Maria" }, { displayName: "Dave", givenName: "Dave", ...linked }],
  organizations: [{ name: "Gallo Ceramiche", title: "Owner" }, { name: "Volley club" }],
  phoneNumbers: [{ value: "+39 338 555 0412", type: "mobile", canonicalForm: "+393385550412" }, { value: "+39 02 1", ...linked }],
  emailAddresses: [{ value: "davide@example.com", type: "home" }],
  urls: [{ value: "https://instagram.com/davide", type: "profile" }],
  addresses: [{ streetAddress: "Via Roma 12", postalCode: "20121", city: "Milano", country: "Italy", type: "home", formattedValue: "Via Roma 12, 20121 Milano, Italy" }],
  birthdays: [{ date: { month: 3, day: 12 } }],
  biographies: [{ value: "Met at the volley tournament." }],
  memberships: [
    { contactGroupMembership: { contactGroupResourceName: "contactGroups/myContacts", contactGroupId: "myContacts" } },
    { contactGroupMembership: { contactGroupResourceName: "contactGroups/starred" } },
    { contactGroupMembership: { contactGroupResourceName: "contactGroups/7a1b" } },
  ],
  photos: [{ url: "https://lh3.example/contacts/abc=s100", default: false }],
};

test("a person as the Contacts page shows it: only the contact's own entries, labels without system groups", () => {
  const contact = toContact(person, { "people/c1": "https://lh3.example/contacts/abc" });
  assert.deepEqual(contact, {
    id: "people/c1",
    name: "Davide Gallo",
    givenName: "Davide",
    familyName: "Gallo",
    company: "Gallo Ceramiche",
    jobTitle: "Owner",
    phones: [{ value: "+39 338 555 0412", type: "mobile" }],
    emails: [{ value: "davide@example.com", type: "home" }],
    urls: [{ value: "https://instagram.com/davide", type: "profile" }],
    addresses: [{ street: "Via Roma 12", postalCode: "20121", city: "Milano", country: "Italy", type: "home" }],
    birthday: { month: 3, day: 12 },
    notes: "Met at the volley tournament.",
    labels: ["contactGroups/7a1b"],
    hasPhoto: true,
    photoUrl: "https://lh3.example/contacts/abc=s100",
    placeholder: true,
    updatedAt: "2026-10-01T10:00:00Z",
  });
  // Another photo since: no longer the placeholder.
  assert.equal(toContact({ ...person, photos: [{ url: "https://lh3.example/contacts/xyz=s100" }] }, { "people/c1": "https://lh3.example/contacts/abc" }).placeholder, undefined);
  assert.equal(photoKey("https://lh3.example/contacts/abc=s100?x=1"), "https://lh3.example/contacts/abc");
});

test("the editor's input is cleaned: empties dropped, system groups refused, bad dates ignored", () => {
  assert.deepEqual(
    parseInput({
      givenName: "  Elena ",
      phones: [{ value: " +39 347 100 2000 ", type: "mobile" }, { value: "   " }],
      emails: "nope",
      urls: [{ value: "x.com/elena", type: "" }],
      addresses: [{ city: "Torino", type: "work" }, { type: "home" }],
      birthday: { month: 13, day: 1 },
      labels: ["contactGroups/myContacts", "contactGroups/9z", 4],
      notes: "",
    }),
    {
      givenName: "Elena",
      familyName: undefined,
      company: undefined,
      jobTitle: undefined,
      phones: [{ value: "+39 347 100 2000", type: "mobile" }],
      emails: [],
      urls: [{ value: "x.com/elena" }],
      addresses: [{ city: "Torino", type: "work" }],
      notes: undefined,
      labels: ["contactGroups/9z"],
    }
  );
  assert.equal(parseInput("x"), undefined);
});

test("an update writes only what changed, and keeps what the editor doesn't show", () => {
  const input = parseInput({ ...toContact(person), jobTitle: "CEO", labels: [], notes: "Met at the volley tournament." })!;
  const { body, fields } = personUpdate(person, input);
  assert.deepEqual(fields, ["organizations", "memberships"]);
  assert.deepEqual(body.organizations, [{ name: "Gallo Ceramiche", title: "CEO" }, { name: "Volley club" }]);
  // Starred and My Contacts stay, the label goes.
  assert.deepEqual(body.memberships, [
    { contactGroupMembership: { contactGroupResourceName: "contactGroups/myContacts" } },
    { contactGroupMembership: { contactGroupResourceName: "contactGroups/starred" } },
  ]);
  assert.deepEqual(body.metadata, { sources: [{ type: "CONTACT", id: "c1", etag: "e1" }] });
  assert.equal(body.etag, "e1");

  const renamed = personUpdate(person, { ...input, givenName: "Dav", birthday: { year: 1990, month: 3, day: 12 } });
  assert.deepEqual(renamed.fields, ["names", "organizations", "birthdays", "memberships"]);
  assert.deepEqual(renamed.body.names, [{ middleName: "Maria", givenName: "Dav", familyName: "Gallo" }]);
  assert.deepEqual(renamed.body.birthdays, [{ date: { year: 1990, month: 3, day: 12 } }]);

  assert.deepEqual(personUpdate(person, parseInput(toContact(person))!).fields, []);
});

test("a new contact, a copy and a label change are valid People API bodies", () => {
  const created = newPerson(parseInput({ givenName: "Sara", phones: [{ value: "+39 320 555 0101" }], labels: ["contactGroups/9z"] })!);
  assert.deepEqual(created.memberships, [
    { contactGroupMembership: { contactGroupResourceName: "contactGroups/myContacts" } },
    { contactGroupMembership: { contactGroupResourceName: "contactGroups/9z" } },
  ]);
  assert.deepEqual(created.names, [{ givenName: "Sara", familyName: "" }]);

  const copy = duplicatePerson(person);
  assert.equal(copy.resourceName, undefined);
  assert.equal(copy.names?.length, 1);
  assert.deepEqual(copy.phoneNumbers, [{ value: "+39 338 555 0412", type: "mobile", canonicalForm: "+393385550412" }]);

  assert.equal(withLabel(person, "contactGroups/7a1b", true), undefined);
  assert.deepEqual(withLabel(person, "contactGroups/7a1b", false)!.memberships?.map((m) => m.contactGroupMembership?.contactGroupResourceName), [
    "contactGroups/myContacts",
    "contactGroups/starred",
  ]);
  const only = { ...person, memberships: [{ contactGroupMembership: { contactGroupResourceName: "contactGroups/7a1b" } }] };
  assert.deepEqual(withLabel(only, "contactGroups/7a1b", false)!.memberships, [{ contactGroupMembership: { contactGroupResourceName: "contactGroups/myContacts" } }]);
});
