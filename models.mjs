import { Schema, model } from "mongoose";

const messageSchema = new Schema({
  _id: String,
  groupId: String,
  authorId: String,
  authorName: String,
  createdOn: Date,
  message: String,
  media: String,
});

export const Message = model("Message", messageSchema);
