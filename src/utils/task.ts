import { PostgresClient } from "@dustinrouillard/database-connectors/postgres";
import { RedisClient } from "@dustinrouillard/database-connectors/redis";
import { Debug } from "@dustinrouillard/fastify-utilities/modules/logger";

import { pack } from "erlpack";
import { DiscordHook } from "../config";

import { RabbitChannel } from "../connectivity/rabbitmq";
import { getLb, getPosts } from "./api";

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

        const user = await PostgresClient.oneOrNone('SELECT id, score, avatar, name, username FROM users WHERE id = $1;', [post.creator.uid]);
        if (!user) await PostgresClient.none('INSERT INTO users (id, score, username, name, bio, avatar) VALUES ($1, $2, $3, $4, $5, $6);', [
          post.creator.uid,
          post.creator.gmScore + 1,
          post.creator.username,
          post.creator.name,
          post.creator.bio,
          post.creator.avatarUrl
        ]);

        if (user && (user.username != post.creator.username || user.name != post.creator.name || user.avatarUrl != post.creator.avatarUrl)) {
          await PostgresClient.none('UPDATE users SET score = $2, name = $3, username= $4, avatar = $5 WHERE id = $1;', [
            post.creator.uid,
            user.score != post.creator.gmScore + 1 ? post.creator.gmScore + 1 : post.creator.gmScore,
            post.creator.name,
            post.creator.username,
            post.creator.avatarUrl
          ]);
        }

        await PostgresClient.none(`INSERT INTO posts (id, creation_time, type, creator, text) VALUES ($1, $2, $3, $4, $5)`, [id, new Date(post.createdAt), post.type, post.creator.uid, post.text || 'gm']);

        Debug(`New ${post.type.toLowerCase()} from ${post.creator.name} @${post.creator.username}`);
        const rank = await PostgresClient.oneOrNone('SELECT rank FROM ranks WHERE id = $1;', [post.creator.uid]);
        RabbitChannel.sendToQueue('dstn-gm-gateway-ingest', pack({
          t: 1, d: {
            id,
            creation_time: new Date(post.createdAt).toISOString(),
            type: post.type,
            text: post.text,
            creator: {
              id: post.creator.uid,
              score: post.creator.gmScore + 1,
              username: post.creator.username,
              name: post.creator.name,
              bio: post.creator.bio,
              avatar: post.creator.avatarUrl,
              rank: rank.rank
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
    } catch (error: any) {
      Debug('Error polling posts, api is probably down, waiting 1 minute before trying again', error.toString());

      throttle = true;
      await new Promise(resolve => setTimeout(() => {
        throttle = false;
        resolve(true);
      }, 1000 * 60));
    }
  }, 5000);

  async function call() {
    const last_top = JSON.parse(await RedisClient.get('users/top') || '[]');
    const users = await PostgresClient.manyOrNone('SELECT users.id, score, username, name, bio, avatar, rank FROM users LEFT JOIN ranks ON users.id = ranks.id WHERE users.hidden IS FALSE ORDER BY rank ASC LIMIT 10;');
    if (JSON.stringify(users) == JSON.stringify(last_top)) return;
    await RedisClient.set('users/top', JSON.stringify(users));

    RabbitChannel.sendToQueue('dstn-gm-gateway-ingest', pack({ t: 0, d: { leaderboard: users } }));
  }

  async function callLb() {
    const last_top = JSON.parse(await RedisClient.get('users/top/official') || '[]');
    const lb = await getLb(true);
    if (JSON.stringify(lb) == JSON.stringify(last_top)) return;
    await RedisClient.set('users/top/official', JSON.stringify(lb));

    RabbitChannel.sendToQueue('dstn-gm-gateway-ingest', pack({ t: 2, d: { leaderboard: lb } }));
  }

  setInterval(call, 10000);
  setInterval(callLb, 1000 * 60 * 10);
}

getGms();