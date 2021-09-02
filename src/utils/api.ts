import { Post } from "../types/Post";

export async function getPosts(): Promise<Post[]> {
  const data: Post[] = await fetch('https://api.gm.town/posts/').then(r => r.json());
  return data.reverse();
}