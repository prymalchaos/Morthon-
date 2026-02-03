function rngInt(min, max){
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateMaze(cols, rows){
  // Ensure odd dims
  if (cols % 2 === 0) cols += 1;
  if (rows % 2 === 0) rows += 1;

  // 0 wall, 1 floor
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));

  // Carve cells at odd coords
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

      // carve wall between
      grid[cur.y + d.y/2][cur.x + d.x/2] = 1;
      grid[ny][nx] = 1;
      stack.push({ x:nx, y:ny });
      carved = true;
      break;
    }
    if (!carved) stack.pop();
  }

  // Pellets on some floor tiles (excluding start)
  const pellets = new Set();
  for (let y=1; y<rows-1; y++){
    for (let x=1; x<cols-1; x++){
      if (grid[y][x] !== 1) continue;
      if (x === start.x && y === start.y) continue;
      if (Math.random() < 0.55) pellets.add(`${x},${y}`);
    }
  }

  return { grid, pellets, start };
}