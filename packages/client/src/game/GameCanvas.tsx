import { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import * as Colyseus from 'colyseus.js';

// Constants matching server
const GAME_WIDTH = 2000;
const GAME_HEIGHT = 2000;

export const GameCanvas = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [client, setClient] = useState<Colyseus.Client | null>(null);
    const [room, setRoom] = useState<Colyseus.Room | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // 1. Init Pixi
        const app = new PIXI.Application();
        
        (async () => {
            await app.init({ 
                width: 800, 
                height: 600, 
                backgroundColor: 0x1099bb 
            });
            containerRef.current?.appendChild(app.canvas);

            // World Container (Camera)
            const world = new PIXI.Container();
            app.stage.addChild(world);

            // 2. Connect to Server
            const colyseusClient = new Colyseus.Client("ws://localhost:2567");
            setClient(colyseusClient);

            try {
                const joinedRoom = await colyseusClient.joinOrCreate("agar", {
                    wallet: "0xUserWallet", // Mock wallet for now
                    amount: 10
                });
                setRoom(joinedRoom);
                console.log("Joined room:", joinedRoom.name);

                const blobs = new Map<string, PIXI.Graphics>();
                const pellets = new Map<string, PIXI.Graphics>();

                // 3. State Sync
                joinedRoom.state.players.onAdd((player: any, sessionId: string) => {
                    player.blobs.onAdd((blob: any) => {
                        const g = new PIXI.Graphics();
                        g.circle(0, 0, blob.radius);
                        g.fill(0xFF0000);
                        g.x = blob.x;
                        g.y = blob.y;
                        world.addChild(g);
                        blobs.set(blob.id, g);

                        // Listen for updates
                        blob.onChange(() => {
                            g.x = blob.x;
                            g.y = blob.y;
                            g.clear();
                            g.circle(0, 0, blob.radius);
                            g.fill(0xFF0000);
                        });
                    });
                });

                joinedRoom.state.pellets.onAdd((pellet: any, id: string) => {
                    const g = new PIXI.Graphics();
                    g.circle(0, 0, 5); // Fixed pellet size
                    g.fill(0x00FF00);
                    g.x = pellet.x;
                    g.y = pellet.y;
                    world.addChild(g);
                    pellets.set(id, g);
                });

                joinedRoom.state.pellets.onRemove((pellet: any, id: string) => {
                    const g = pellets.get(id);
                    if (g) {
                        world.removeChild(g);
                        g.destroy();
                        pellets.delete(id);
                    }
                });

                // Camera Follow
                app.ticker.add(() => {
                    // Simple camera follow logic would go here
                    // centering on the user's blob
                });

            } catch (e) {
                console.error("Join error:", e);
            }
        })();

        return () => {
            app.destroy(true, { children: true });
            room?.leave();
        };
    }, []);

    return <div ref={containerRef} />;
};

