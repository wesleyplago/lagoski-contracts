# lagoski-contracts

**Published Language** do Lagoski: o contrato dos eventos de integração entre os bounded
contexts. Os serviços não compartilham código; compartilham estes schemas.

| Pasta | Conteúdo |
| --- | --- |
| [`schemas/cloudevent.json`](schemas/cloudevent.json) | envelope CloudEvents 1.0 usado por todos os eventos |
| `schemas/<contexto>/<evento>.v<N>.json` | JSON Schema 2020-12 do `data` de cada evento |
| `asyncapi/<contexto>.yaml` | AsyncAPI 3.0 por tópico: canal, mensagens, cabeçalhos (`ce_type`) |
| `examples/` | um evento real de cada tipo, exportado dos próprios serviços |

## Tópicos e eventos

| Tópico | Eventos | Dono |
| --- | --- | --- |
| `catalog.events` | `product.published`, `variant.price-changed`, `product.discontinued` | [lagoski-catalog](https://github.com/wesleyplago/lagoski-catalog) |
| `ordering.events` | `order.placed`, `order.confirmed`, `order.cancelled` | [lagoski-ordering](https://github.com/wesleyplago/lagoski-ordering) |
| `inventory.events` | `stock.reserved`, `stock.reservation-rejected`, `stock.released`, `stock.committed`, `reservation.expired` | [lagoski-inventory](https://github.com/wesleyplago/lagoski-inventory) |
| `payment.events` | `payment.requested`, `payment.authorized`, `payment.declined`, `payment.refunded` | [lagoski-payment](https://github.com/wesleyplago/lagoski-payment) |
| `fulfillment.events` | `shipment.created`, `shipment.dispatched`, `shipment.delivered` | [lagoski-fulfillment](https://github.com/wesleyplago/lagoski-fulfillment) |

Tipo completo: `lagoski.<contexto>.<agregado>.<fato-no-passado>.v<N>`, por exemplo
`lagoski.ordering.order.placed.v1`. É o valor do atributo de mensagem `ce_type`, que os filtros das
assinaturas (SNS filter policy e filtro do Pub/Sub) usam.

## Regras

- **Valores em centavos**, inteiros. Datas em ISO 8601 UTC.
- **`correlationid`** é o id do pedido em toda a saga; **`causationid`** é o id do evento que causou este.
- **Tolerant reader**: os schemas aceitam campos extras (`additionalProperties: true`). Consumidores
  leem só o que usam.
- **Evolução**: campo novo opcional mantém a versão. Campo obrigatório novo, campo removido ou mudança
  de significado exige `v2`, publicado **em paralelo** ao `v1` até todos os consumidores migrarem.
  O CI compara com a tag anterior e falha se um schema existente quebrar compatibilidade.

## Como os serviços usam

Cada serviço tem um teste de contrato (`pnpm test:contracts`) que gera os eventos com o código real de
produção e valida contra estes schemas. O CI de cada serviço faz checkout deste repositório na tag
fixada em `CONTRACTS_REF`; subir a versão aqui não quebra ninguém até o serviço adotar a nova tag.

```bash
pnpm install
pnpm validate
```
