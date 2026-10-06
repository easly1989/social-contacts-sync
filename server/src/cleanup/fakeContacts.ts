import { ContactsApi, Group, Person } from "./people";

/** A People API error, shaped like googleapis' GaxiosError. */
function googleError(code: number, message: string): Error {
  return Object.assign(new Error(message), { code, response: { status: code, data: { error: { code, message } } } });
}

/** An in-memory address book with the People API's behaviour that matters here (tests only). */
export class FakeContacts implements ContactsApi {
  people = new Map<string, Person>();
  photos = new Map<string, string>();
  calls: string[] = [];
  labels: Group[] = [];
  /** Google gives every new photo a new address. */
  private photoVersions = new Map<string, number>();
  private next = 100;
  private created = 0;

  constructor(people: Person[] = [], photos: Record<string, string> = {}) {
    for (const p of people) this.people.set(p.resourceName!, { etag: "e0", ...structuredClone(p) });
    for (const [id, photo] of Object.entries(photos)) this.photos.set(id, photo);
  }

  /** As Google returns it: with the photo, and the contact source carrying the etag. */
  private withPhoto(person: Person): Person {
    const id = person.resourceName!;
    const [first, ...others] = person.metadata?.sources ?? [];
    const contactSource = { type: "CONTACT", id: id.replace("people/", ""), ...first, etag: person.etag };
    return {
      ...structuredClone(person),
      metadata: { ...person.metadata, sources: [contactSource, ...others] },
      photos: this.photos.has(id) ? [{ url: `https://photos.example/${id}/v${this.photoVersions.get(id) ?? 0}=s100`, default: false }] : [{ url: "https://photos.example/default", default: true }],
    };
  }

  async list() {
    this.calls.push("list");
    return [...this.people.values()].map((p) => this.withPhoto(p));
  }
  async get(id: string) {
    const person = this.people.get(id);
    if (!person) throw Object.assign(new Error("not found"), { code: 404 });
    return this.withPhoto(person);
  }
  async update(id: string, body: Person, fields: readonly string[]) {
    this.calls.push(`update ${id}`);
    const person = this.people.get(id)!;
    // The rules in updateContact's documentation.
    const source = body.metadata?.sources?.find((s) => s.type === "CONTACT");
    if (!source) throw googleError(400, "Request must set person.metadata.sources for the contact source being updated.");
    if (source.etag !== person.etag) throw googleError(400, "failedPrecondition: the contact changed since it was read.");
    if (fields.includes("memberships") && !body.memberships?.some((m) => m.contactGroupMembership?.contactGroupResourceName))
      throw googleError(400, "A contact must have at least one contact group membership.");
    for (const singleton of ["names", "birthdays", "biographies"] as const)
      if (fields.includes(singleton) && (body[singleton]?.length ?? 0) > 1) throw googleError(400, `Only one ${singleton} entry is allowed.`);
    for (const field of fields) (person as Record<string, unknown>)[field] = structuredClone((body as Record<string, unknown>)[field]);
    person.etag = `e${this.next++}`;
    person.metadata = { sources: [{ updateTime: new Date(Date.UTC(2026, 9, 3, 12, 0, this.next % 60)).toISOString() }] };
    return this.withPhoto(person);
  }
  async create(body: Person) {
    const id = `people/new${++this.created}`;
    this.calls.push(`create ${id}`);
    for (const singleton of ["names", "birthdays", "biographies"] as const)
      if ((body[singleton]?.length ?? 0) > 1) throw googleError(400, `Only one ${singleton} entry is allowed.`);
    this.people.set(id, { ...structuredClone(body), resourceName: id, etag: "e0" });
    return this.withPhoto(this.people.get(id)!);
  }
  async remove(id: string) {
    this.calls.push(`delete ${id}`);
    this.people.delete(id);
    this.photos.delete(id);
  }
  async setPhoto(id: string, photo: string) {
    this.calls.push(`setPhoto ${id}`);
    this.photos.set(id, photo);
    this.photoVersions.set(id, (this.photoVersions.get(id) ?? 0) + 1);
  }
  async deletePhoto(id: string) {
    this.calls.push(`deletePhoto ${id}`);
    this.photos.delete(id);
  }
  async photo(person: Person) {
    return this.photos.get(person.resourceName!) ?? null;
  }
  async groups() {
    return structuredClone(this.labels);
  }
  async createGroup(name: string) {
    const group = { id: `contactGroups/label${this.labels.length + 1}`, name };
    this.calls.push(`createGroup ${name}`);
    this.labels.push(group);
    return group;
  }
}
