#!/bin/sh
# Cria do zero o servidor do SIGOF na Azure (rodar uma vez, com `az login` feito).
#
#   sh deploy/provisionar-azure.sh
#
# Escolhas (registradas na RFC):
# - Região northcentralus: a conta Azure for Students só libera 5 regiões
#   (spaincentral, switzerlandnorth, mexicocentral, chilecentral e
#   northcentralus); esta é a mais barata.
# - VM Standard_B2als_v2 (2 vCPU, 4 GB): cabe staging + produção +
#   monitoramento, por ~US$ 30/mês, dentro do crédito de estudante.
# - Só as portas 80 e 443 abertas. Nenhuma porta de administração (SSH)
#   exposta: a manutenção é feita por `az vm run-command`, autenticada na Azure.
set -eu

GRUPO=rg-sigof
REGIAO=northcentralus
VM=vm-sigof
ROTULO_DNS=sigof-staging
DOMINIO_STAGING="$ROTULO_DNS.$REGIAO.cloudapp.azure.com"

DIR=$(dirname "$0")
CLOUD_INIT=$(mktemp)
sed "s/__DOMINIO_STAGING__/$DOMINIO_STAGING/" "$DIR/cloud-init.yaml" > "$CLOUD_INIT"

az group create --name "$GRUPO" --location "$REGIAO" --output none

az vm create \
  --resource-group "$GRUPO" \
  --name "$VM" \
  --image Ubuntu2404 \
  --size Standard_B2als_v2 \
  --os-disk-size-gb 32 \
  --storage-sku StandardSSD_LRS \
  --admin-username sigof \
  --generate-ssh-keys \
  --public-ip-sku Standard \
  --public-ip-address-dns-name "$ROTULO_DNS" \
  --nsg-rule NONE \
  --custom-data "$CLOUD_INIT" \
  --output none

NSG="${VM}NSG"
az network nsg rule create --resource-group "$GRUPO" --nsg-name "$NSG" \
  --name permitir-http --priority 100 --destination-port-ranges 80 \
  --access Allow --protocol Tcp --output none
az network nsg rule create --resource-group "$GRUPO" --nsg-name "$NSG" \
  --name permitir-https --priority 110 --destination-port-ranges 443 \
  --access Allow --protocol Tcp --output none

rm -f "$CLOUD_INIT"
echo "Servidor criado: https://$DOMINIO_STAGING"
