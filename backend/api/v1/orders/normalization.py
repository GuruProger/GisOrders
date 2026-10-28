def normalize_tree_type(value: str) -> str:
	"""Приводит породу к единому виду: без лишних пробелов, в нижнем регистре, ё -> е."""
	return " ".join(value.replace("ё", "е").replace("Ё", "Е").lower().split())
