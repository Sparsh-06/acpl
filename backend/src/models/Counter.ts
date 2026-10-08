import { Schema, model } from 'mongoose';

const counterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 },
});

const Counter = model('Counter', counterSchema);

/**
 * Atomically increments and returns the next number for a sequence.
 * A single findOneAndUpdate with $inc is atomic in MongoDB, so two tickets
 * created at the same time can never get the same number.
 */
export async function nextSequence(name: string): Promise<number> {
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  return counter!.seq;
}
