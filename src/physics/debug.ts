import Matter from 'matter-js';

export const wireDebugEvents = (engine: Matter.Engine) => {
  Matter.Events.on(engine, 'collisionStart', (event: Matter.IEventCollision<Matter.Engine>) => {
    for (const pair of event.pairs) {
      console.log('💥 Collision:', {
        bodyA: pair.bodyA.label,
        bodyB: pair.bodyB.label
      });
    }
  });
};
