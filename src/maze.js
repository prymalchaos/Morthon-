export function generateMaze(cols, rows){
  if (cols % 2 === 0) cols += 1;
  if (rows % 2 === 0) rows += 1;

  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));

  // Perfect maze carve (DFS)
  const stack = [];
  const start = { x: 1, y: 1 };
  grid[start.y][start.x] = 1;
  stack.push(start);

  const dirs = [
    {x: 2, y: 0},
    {x:-2, y: 0},
    {x: 0, y: 2},
    {x: 0, y:-2},
  ];

  while (stack.length){
    const cur = stack[stack.length - 1];
    const shuffled = dirs.slice().sort(() => Math.random() - 0.5);

    let carved = false;
    for (const d of shuffled){
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      if (nx <= 0 || ny <= 0 || nx >= cols-1 || ny >= rows-1) continue;
      if (grid[ny][nx] === 1) continue;

      grid[cur.y + d.y/2][cur.x + d.x/2] = 1;
      grid[ny][nx] = 1;
      stack.push({ x:nx, y:ny });
      carved = true;
      break;
    }
    if (!carved) stack.pop();
  }

  // Pellets
  const pellets = new Set();
  for (let y=1; y<rows-1; y++){
    for (let x=1; x<cols-1; x++){
      if (grid[y][x] !== 1) continue;
      if (x === start.x && y === start.y) continue;
      if (Math.random() < 0.55) pellets.add(`${x},${y}`);
    }
  }

  // Find farthest reachable floor tile from start to place the exit
  const exit = farthestTileBFS(grid, start);

  // Ensure exit isn't a pellet
  pellets.delete(`${exit.x},${exit.y}`);

  return { grid, pellets, start, exit };
}

function farthestTileBFS(grid, start){
  const rows = grid.length;
  const cols = grid[0].length;

  const dist = Array.from({ length: rows }, () => Array(cols).fill(-1));
  const q = [];
  dist[start.y][start.x] = 0;
  q.push({ x: start.x, y: start.y });

  const dirs = [
    {x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}
  ];

  let far = { x: start.x, y: start.y, d: 0 };

  while (q.length){
    const cur = q.shift();
    const d0 = dist[cur.y][cur.x];

    if (d0 > far.d){
      far = { x: cur.x, y: cur.y, d: d0 };
    }

    for (const d of dirs){
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (grid[ny][nx] !== 1) continue;
      if (dist[ny][nx] !== -1) continue;
      dist[ny][nx] = d0 + 1;
      q.push({ x: nx, y: ny });
    }
  }

  // Slightly bias away from borders if possible (purely cosmetic)
  return { x: far.x, y: far.y };
}