import { RedisClient } from "@dustinrouillard/database-connectors/redis";
import { GMAuth } from "../config";
import { Creator, Post } from "../types/Post";

export async function getPosts(): Promise<Post[]> {
  const data: { feed: Post[] } = await fetch('https://api.gm.town/posts/feed', { headers: { authorization: `Bearer ${GMAuth}` } }).then(r => r.json());
  return data.feed.reverse();
}

export async function getLb(): Promise<Creator[]> {
  const cached = JSON.parse(await RedisClient.get('users/top/official') || '[]');

  if (!cached[0]) {
    const data: { leaderboard: Creator[] } = await fetch('https://api.gm.town/users/leaderboard', { headers: { authorization: `Bearer ${GMAuth}` } }).then(r => r.json());
    await RedisClient.set('users/top/official', JSON.stringify(data), 'ex', 600);
    return data.leaderboard;
  }

  return cached;
}