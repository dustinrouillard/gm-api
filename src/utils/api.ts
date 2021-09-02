import { GMAuth } from "../config";
import { Post } from "../types/Post";

export async function getPosts(): Promise<Post[]> {
  const data: { feed: Post[] } = await fetch('https://api.gm.town/posts/feed', { headers: { authorization: `Bearer ${GMAuth}` } }).then(r => r.json());
  return data.feed.reverse();
}