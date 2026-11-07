'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {stem,stemText}=require('../src/core/lang-pt');
test('Portuguese inflections and accentless queries share a stem',()=>{
 for(const family of [['licitar','licitação','licitações','licitacao'],['revogar','revogação','revogado'],['vetar','vetado','veto'],['administrativo','administração','administrativos'],['ato','atos'],['lei','leis'],['poder','poderes'],['emenda','emendas']])assert.equal(new Set(family.map(stem)).size,1,family.join(', '));
 assert.equal(stemText('Lei 14.133 e quinze dias'),'lei 14133 e 15 dia');
});
