import { ContactsApi, Person } from "./people";

/** An in-memory address book with the People API's behaviour that matters here (tests only). */
export class FakeContacts implements ContactsApi {
  people = new Map<string, Person>();
  photos = new Map<string, string>();
  calls: string[] = [];
  private next = 100;
  private created = 0;

  constructor(people: Person[] = [], photos: Record<string, string> = {}) {
    for (const p of people) this.people.set(p.resourceName!, { etag: "e0", ...structuredClone(p) });
    for (const [id, photo] of Object.entries(photos)) this.photos.set(id, photo);
  }

  private withPhoto(person: Person): Person {
    const id = person.resourceName!;
    return { ...structuredClone(person), photos: this.photos.has(id) ? [{ url: `https://photos.example/${id}`, default: false }] : [{ url: "https://photos.example/default", default: true }] };
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
    if (body.etag !== person.etag) throw Object.assign(new Error("etag mismatch"), { code: 400 });
    for (const field of fields) (person as Record<string, unknown>)[field] = structuredClone((body as Record<string, unknown>)[field]);
    person.etag = `e${this.next++}`;
    person.metadata = { sources: [{ updateTime: new Date(Date.UTC(2026, 9, 3, 12, 0, this.next % 60)).toISOString() }] };
    return this.withPhoto(person);
  }
  async create(body: Person) {
    const id = `people/new${++this.created}`;
    this.calls.push(`create ${id}`);
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
  }
  async deletePhoto(id: string) {
    this.calls.push(`deletePhoto ${id}`);
    this.photos.delete(id);
  }
  async photo(person: Person) {
    return this.photos.get(person.resourceName!) ?? null;
  }
}
