import { PostgresClient } from "@dustinrouillard/database-connectors/postgres";
import { RedisClient } from "@dustinrouillard/database-connectors/redis";
import { Debug } from "@dustinrouillard/fastify-utilities/modules/logger";

import { pack } from "erlpack";
import { DiscordHook } from "../config";

import { RabbitChannel } from "../connectivity/rabbitmq";
import { getPosts } from "./api";

export async function getGms(): Promise<void> {
  let throttle = false;
  setInterval(async () => {
    try {
      if (throttle) return;

      const posts = await getPosts();

      for await (const post of posts) {
        const id = post.id || Buffer.from(`${post.createdAt}:${post.creator.uid}`).toString('base64');
        const db = await PostgresClient.oneOrNone('SELECT id FROM posts WHERE id = $1;', [id]);
        if (db) continue;

        const user = await PostgresClient.oneOrNone('SELECT id, score FROM users WHERE id = $1;', [post.creator.uid]);
        if (!user) await PostgresClient.none('INSERT INTO users (id, score, username, name, bio, avatar) VALUES ($1, $2, $3, $4, $5, $6);', [
          post.creator.uid,
          post.creator.gmScore + 1,
          post.creator.username,
          post.creator.name,
          post.creator.bio,
          post.creator.avatarUrl
        ]);

        if (user && user.score != (post.creator.gmScore + 1)) await PostgresClient.none('UPDATE users SET score = $2 WHERE id = $1;', [post.creator.uid, post.creator.gmScore + 1]);

        await PostgresClient.none(`INSERT INTO posts (id, creation_time, type, creator) VALUES ($1, $2, $3, $4)`, [id, new Date(post.createdAt), post.type, post.creator.uid]);

        Debug(`New ${post.type.toLowerCase()} from ${post.creator.name} @${post.creator.username}`);
        RabbitChannel.sendToQueue('dstn-gm-gateway-ingest', pack({
          t: 1, d: {
            post: {
              id,
              creation_time: new Date(post.createdAt),
              type: post.type,
              creator: post.creator.uid
            }, user: {
              id: post.creator.uid,
              score: post.creator.gmScore + 1,
              username: post.creator.username,
              name: post.creator.name,
              bio: post.creator.bio,
              avatar: post.creator.avatarUrl
            }
          }
        }));
        if (DiscordHook) await fetch(DiscordHook, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              title: post.type.toLowerCase(),
              description: `${post.creator.name} currently has ${(post.creator.gmScore + 1).toLocaleString()
                } score`,
              author: { name: `${post.creator.name} @${post.creator.username} `, icon_url: post.creator.avatarUrl },
              timestamp: new Date(post.createdAt).toISOString(),
              footer: { text: 'gm watcher • dstn.to' }
            }]
          })
        })

        const cachedTop = JSON.parse(await RedisClient.get('users/top') || '[]');
        const hasUser = cachedTop.find((user: { id: string; score: number }) => user.id == post.creator.uid);
        if (hasUser) {
          // User has new score, we need to update the top and push lb update to queue
          hasUser.score = post.creator.gmScore + 1;
          await RedisClient.set('users/top', JSON.stringify(cachedTop));
          RabbitChannel.sendToQueue('dstn-gm-gateway-ingest', pack({ t: 0, d: { leaderboard: cachedTop } }));
        }
      }
    } catch (error) {
      Debug('Error polling posts, api is probably down, waiting 1 minute before trying again');

      throttle = true;
      await new Promise(resolve => setTimeout(() => {
        throttle = false;
        resolve(true);
      }, 1000 * 60));
    }
  }, 5000);

  async function call() {
    const last_top = JSON.parse(await RedisClient.get('users/top') || '[]');
    const users = await PostgresClient.manyOrNone('SELECT users.id, score, username, name, bio, avatar, rank FROM users LEFT JOIN ranks ON users.id = ranks.id WHERE rank <= 10 ORDER BY rank ASC LIMIT 10;');
    if (JSON.stringify(users) == JSON.stringify(last_top)) return;
    await RedisClient.set('users/top', JSON.stringify(users));

    RabbitChannel.sendToQueue('dstn-gm-gateway-ingest', pack({ t: 0, d: { leaderboard: users } }));
  }

  setInterval(async () => {
    call()
  }, 10000);
}

getGms();