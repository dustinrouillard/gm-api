import { RedisClient } from "@dustinrouillard/database-connectors/redis";
import { GMAuth } from "../config";
import { Creator, Post } from "../types/Post";

export async function getPosts(): Promise<Post[]> {
  const data: { feed: Post[] } = await fetch('https://api.gm.town/posts/feed', { headers: { authorization: `Bearer ${GMAuth}` } }).then(r => r.json());
  return data.feed.reverse();
}

export async function getLb(ignoreCache?: boolean): Promise<Creator[]> {
  const cached = JSON.parse(await RedisClient.get('users/top/official') || '[]');

  if (!cached[0] || ignoreCache) {
    const data: { leaderboard: Creator[] } = await fetch('https://api.gm.town/users/leaderboard', { headers: { authorization: `Bearer ${GMAuth}` } }).then(r => r.json());
    if (!ignoreCache) await RedisClient.set('users/top/official', JSON.stringify(data.leaderboard));
    return data.leaderboard;
  }

  return cached;
}