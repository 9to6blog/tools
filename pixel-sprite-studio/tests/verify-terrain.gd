extends SceneTree
var checks = {}
var failures = []

func _initialize():
	call_deferred("verify")

func normalized(m: int, road: bool) -> int:
	if road: return m & 85
	if not (m & 1) or not (m & 4): m &= ~2
	if not (m & 4) or not (m & 16): m &= ~8
	if not (m & 16) or not (m & 64): m &= ~32
	if not (m & 64) or not (m & 1): m &= ~128
	return m

func verify():
	var data = JSON.parse_string(FileAccess.get_file_as_string("res://pixel_terrain/layout.json"))
	var road = data.options.kind == "road16"
	var tileset = load("res://pixel_terrain/tileset.tres") as TileSet
	checks["resource_load"] = tileset != null
	checks["two_terrains"] = tileset.get_terrains_count(0) == 2
	checks["terrain_mode"] = tileset.get_terrain_set_mode(0) == (TileSet.TERRAIN_MODE_MATCH_SIDES if road else TileSet.TERRAIN_MODE_MATCH_CORNERS_AND_SIDES)
	var atlas = tileset.get_source(0) as TileSetAtlasSource
	checks["pattern_count"] = atlas.get_tiles_count() == (17 if road else 48)
	checks["tile_size"] = tileset.tile_size == Vector2i(16,16) and atlas.texture_region_size == Vector2i(16,16)
	var lookup = {}
	for tile in data.tiles:
		if tile.mask != null: lookup[int(tile.mask)] = Vector2i(int(tile.x), int(tile.y))
	var layer = TileMapLayer.new()
	layer.tile_set = tileset
	root.add_child(layer)
	var offsets = [Vector2i(0,-1),Vector2i(1,-1),Vector2i(1,0),Vector2i(1,1),Vector2i(0,1),Vector2i(-1,1),Vector2i(-1,0),Vector2i(-1,-1)]
	var center = Vector2i(3,3)
	var exact = 0
	var erased = 0
	for mask in range(256):
		layer.clear()
		for y in range(7):
			for x in range(7): layer.set_cell(Vector2i(x,y),0,Vector2i.ZERO)
		var cells: Array[Vector2i] = [center]
		for bit in range(8):
			if mask & (1 << bit): cells.append(center + offsets[bit])
		layer.set_cells_terrain_connect(cells,0,1,false)
		var actual = layer.get_cell_atlas_coords(center)
		var expected = lookup[normalized(mask,road)]
		if actual == expected: exact += 1
		elif failures.size()<8: failures.append({"mask":mask,"actual":str(actual),"expected":str(expected)})
		layer.set_cells_terrain_connect([center],0,0,false)
		if layer.get_cell_atlas_coords(center) == Vector2i.ZERO: erased += 1
	checks["all_256_neighborhoods"] = exact == 256
	checks["erase_256_cases"] = erased == 256
	var packed = load("res://pixel_terrain/preview_map.tscn") as PackedScene
	checks["preview_scene_load"] = packed != null
	if packed:
		var preview = packed.instantiate()
		root.add_child(preview)
		checks["preview_cell_count"] = preview.get_used_cells().size() == 384
		var correct = true
		for i in range(data.map.ids.size()):
			var id = int(data.map.ids[i])
			if preview.get_cell_atlas_coords(Vector2i(i%24,i/24)) != Vector2i(id%8,id/8): correct = false
		checks["preview_exact_atlas_indices"] = correct
		preview.free()
	checks["paint_scene_load"] = load("res://pixel_terrain/paint_here.tscn") != null
	layer.free()
	var passed = true
	for key in checks:
		if not checks[key]: passed = false
	var report = {"passed":passed,"checks":checks,"matched_neighborhoods":exact,"erased_cases":erased,"failures":failures}
	var out = FileAccess.open("res://godot-verification.json", FileAccess.WRITE)
	out.store_string(JSON.stringify(report,"  "))
	print(JSON.stringify(report))
	quit(0 if passed else 1)
