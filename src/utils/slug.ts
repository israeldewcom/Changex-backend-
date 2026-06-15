import { Model } from 'mongoose';

export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function generateUniqueSlug(text: string, model: Model<any>, slugField: string = 'uniqueSlug'): Promise<string> {
  let baseSlug = generateSlug(text);
  let slug = baseSlug;
  let counter = 1;
  while (await model.findOne({ [slugField]: slug })) {
    slug = `${baseSlug}-${counter++}`;
  }
  return slug;
}
