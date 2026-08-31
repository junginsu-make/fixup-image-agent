import { requireActiveMember } from "../../lib/membership/server";
import { CharacterStudio } from "./CharacterStudio";

export const dynamic = "force-dynamic";

export default async function CharactersPage() {
  await requireActiveMember();
  return <CharacterStudio />;
}
