import { strict } from './validation.mjs';

// Version reads are tiny and owner-gated by the same boundary as the directory.
// Readers never increment or consume a revision. Database triggers own writes.
export const directoryVersionStatement=(db,board)=>db.prepare(`SELECT d.revision AS directory_revision,
  c.revision AS boards_revision,c.cache_scope FROM recipient_directory_versions d
  CROSS JOIN recipient_catalog_version c WHERE d.board=? AND c.singleton=1`).bind(board);
export const catalogVersionStatement=db=>db.prepare('SELECT revision AS boards_revision,cache_scope FROM recipient_catalog_version WHERE singleton=1');
export function directoryCacheScope(service,scope){return (service.env.SITE_ORIGIN||'')+'#'+scope;}
export async function getRecipientDirectoryState(service,args){
  strict(args,['board']);const board=await service.board(args.board??'main');
  const state=await directoryVersionStatement(service.db,board).first();
  return {board,...state,cache_scope:directoryCacheScope(service,state.cache_scope)};
}
