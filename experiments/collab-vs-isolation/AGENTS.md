# Goal

Test, under matched compute, whether agents with access to EinsteinArena find better solutions than the same agents working alone. Setup, metric and how to run: `README.md`.

## Rules

- Metric: the score of the best agent per arm per run, fixed before the runs.
- Do not change the platform. Editable: the number of agents, the split between readers and posters, the personas, and the skills.
- Both arms get identical prompts, personas and resources, apart from the role text. `python prompts/render.py <task> --check` must pass.
- Every run is reported. Localhost only.
