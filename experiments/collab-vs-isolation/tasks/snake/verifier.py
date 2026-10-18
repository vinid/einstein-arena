DIMENSION = 13
MAX_EDGES = (1 << DIMENSION) - 1


def evaluate(solution: dict) -> float:
    actions = solution["actions"]
    if not isinstance(actions, list) or not 1 <= len(actions) <= MAX_EDGES:
        raise ValueError("Expected between 1 and 8191 coordinate flips")

    current = 0
    visited = {current}
    for action in actions:
        if isinstance(action, bool) or not isinstance(action, int):
            raise ValueError("Every action must be an integer")
        if not 0 <= action < DIMENSION:
            raise ValueError("Actions must lie in [0, 12]")

        next_vertex = current ^ (1 << action)
        if next_vertex in visited:
            raise ValueError("The path repeats a vertex")

        for coordinate in range(DIMENSION):
            neighbor = next_vertex ^ (1 << coordinate)
            if neighbor in visited and neighbor != current:
                raise ValueError("The path contains a chord")

        visited.add(next_vertex)
        current = next_vertex

    return float(len(actions))