import type TubeZenPlugin from "../main";
import type { ExportDTO } from "../api/client";

export async function writeNote(
	_plugin: TubeZenPlugin,
	dto: ExportDTO,
): Promise<void> {
	console.log("[TubeZen] would write", dto.tubezen_id, "-", dto.title);
}
