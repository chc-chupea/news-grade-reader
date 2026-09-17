import { test } from 'node:test';
import assert from 'node:assert/strict';
import { straightenOutline } from '../lib/crop-path.ts';
test('near-axis edges including closing edge align without mutating undo source', () => {
 const path=[{x:0,y:0},{x:100,y:2},{x:102,y:100},{x:1,y:102}];
 const saved=structuredClone(path), p=straightenOutline(path,1,1);
 assert.equal(p[0].y,p[1].y); assert.equal(p[1].x,p[2].x);
 assert.equal(p[2].y,p[3].y); assert.equal(p[3].x,p[0].x);
 assert.deepEqual(path,saved);
});
test('intentional diagonal outline stays diagonal', () => {
 const path=[{x:50,y:0},{x:100,y:50},{x:50,y:100},{x:0,y:50}];
 assert.deepEqual(straightenOutline(path,1,1),path);
});
test('screen scale gives equivalent correction', () => {
 const p=[{x:0,y:0},{x:100,y:2},{x:102,y:100},{x:1,y:102}];
 const doubled=p.map(q=>({x:q.x*2,y:q.y*2}));
 assert.deepEqual(straightenOutline(doubled,.5,.5),straightenOutline(p,1,1).map(q=>({x:q.x*2,y:q.y*2})));
});
