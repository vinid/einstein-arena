#@title Construction 1: Data
import numpy as np

construction_1 = np.array([(0.8470278707092158, 0.2918282514726773), (-0.23745459443195124, -0.8571978965568918), (0.3557900209463371, 0.279097289488927), (-0.8607342601440215, -0.15089717398730187), (-0.4726876231254993, 0.7174253632783496), (-0.3788383952523786, -0.05470430230958746), (-0.03757671392994971, -0.4082819539247519), (0.4800129548135765, 0.7545395596986599), (-0.000979763279861421, 0.8551512034827423), (-0.7797718797834859, 0.33379016991681987), (-0.6541792267650747, -0.5967802443605281), (0.6682256918291543, -0.6282247082504422), (0.9028949024748079, -0.1963885801084583), (0.41165705912895084, -0.2091194383890215), (0.25280396897954216, -0.8907156599623591), (-0.12757658935294616, 0.3676038779372552)])


#@title Construction 1: verification
import scipy as sp

print(f'Construction 1 has {len(construction_1)} points in {construction_1.shape[1]} dimensions.')
pairwise_distances = sp.spatial.distance.pdist(construction_1)
min_distance = np.min(pairwise_distances)
max_distance = np.max(pairwise_distances)

ratio_squared = (max_distance / min_distance)**2
print(f"Ratio of max distance to min distance: sqrt({ratio_squared})")


#@title Construction 1: Visualization
import matplotlib.pyplot as plt

def plot_point_configuration(points: np.ndarray):
  """Plots a 2D point configuration, highlighting closest and furthest pairs."""
  condensed_distances = sp.spatial.distance.pdist(points)
  min_distance = np.min(condensed_distances)
  max_distance = np.max(condensed_distances)
  ratio = (max_distance / min_distance)**2
  distance_matrix = sp.spatial.distance.squareform(condensed_distances)

  max_distance_pairs_indices = np.where(np.isclose(distance_matrix, max_distance))
  min_distance_pairs_indices = np.where(np.isclose(distance_matrix, min_distance))

  plt.figure(figsize=(6, 6))
  plt.scatter(points[:, 0], points[:, 1], color='black', s=100)

  # Highlight max distance pairs (red).
  for i_index, j_index in zip(*max_distance_pairs_indices):
    plt.plot([points[i_index, 0], points[j_index, 0]], [points[i_index, 1], points[j_index, 1]], color='red', linewidth=2, label='maximum distance' if 'maximum distance' not in plt.gca().get_legend_handles_labels()[1] else "")

  # Highlight min distance pairs (blue).
  for i_index, j_index in zip(*min_distance_pairs_indices):
    plt.plot([points[i_index, 0], points[j_index, 0]], [points[i_index, 1], points[j_index, 1]], color='blue', linewidth=2, label='minimum distance' if 'minimum distance' not in plt.gca().get_legend_handles_labels()[1] else "")

  # Customize plot appearance.
  plt.title(f"{len(points)} points on the 2D plane with ratio between maximum distance and minimum distance ~ sqrt({ratio:.9f})")
  plt.axis('off')
  plt.gca().set_aspect('equal', adjustable='box')
  plt.legend()
  plt.show()

plot_point_configuration(construction_1)