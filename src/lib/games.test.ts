import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getGameById,
    getRelatedGames,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });

    it('returns related games from the same category excluding the source game', async () => {
        const [strategyCategory] = await db
            .insert(categories)
            .values({ name: 'Strategy', description: 'strategy category' })
            .returning({ id: categories.id });
        const [adventureCategory] = await db
            .insert(categories)
            .values({ name: 'Adventure', description: 'adventure category' })
            .returning({ id: categories.id });
        const [publisher] = await db
            .insert(publishers)
            .values({ name: 'Pub One', description: 'pub' })
            .returning({ id: publishers.id });

        await db.insert(games).values([
            {
                title: 'Core Strategy',
                description: 'source',
                starRating: 4.5,
                categoryId: strategyCategory.id,
                publisherId: publisher.id,
            },
            {
                title: 'Alpha Tactics',
                description: 'related 1',
                starRating: 4.2,
                categoryId: strategyCategory.id,
                publisherId: publisher.id,
            },
            {
                title: 'Zenith Plans',
                description: 'related 2',
                starRating: 4.4,
                categoryId: strategyCategory.id,
                publisherId: publisher.id,
            },
            {
                title: 'Forest Quest',
                description: 'different category',
                starRating: 4.0,
                categoryId: adventureCategory.id,
                publisherId: publisher.id,
            },
        ]);

        const source = await db
            .select({ id: games.id })
            .from(games)
            .where(eq(games.title, 'Core Strategy'))
            .get();

        expect(source).not.toBeUndefined();

        const related = await getRelatedGames(db, source!.id);
        expect(related.map((game) => game.title)).toEqual(['Alpha Tactics', 'Zenith Plans']);
    });

    it('returns an empty list when no related games exist', async () => {
        const [category] = await db
            .insert(categories)
            .values({ name: 'Puzzle', description: 'puzzle category' })
            .returning({ id: categories.id });
        const [publisher] = await db
            .insert(publishers)
            .values({ name: 'Solo Pub', description: 'pub' })
            .returning({ id: publishers.id });

        const [insertedGame] = await db
            .insert(games)
            .values({
                title: 'Only Puzzle Game',
                description: 'single game in category',
                starRating: 3.8,
                categoryId: category.id,
                publisherId: publisher.id,
            })
            .returning({ id: games.id });

        const related = await getRelatedGames(db, insertedGame.id);
        expect(related).toEqual([]);
    });
});
