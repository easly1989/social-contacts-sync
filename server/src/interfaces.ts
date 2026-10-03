export interface SimpleContact {
  id: string;
  name?: string;
  numbers: string[];
  emails?: string[];
  hasPhoto: boolean;
  photoUrl?: string;
}
