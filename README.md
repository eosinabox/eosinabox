# eosinabox
create private eosio blockchain fast and easy 

# Overview
0. This is for people who are comfortable with the linux command line and remote servers using ssh.
1. start a small *controller* on the internet, example: AWS EC2 t2.nano server.
2. start 5 servers for the blockchain with a minimum of 1 GB RAM and 8 GB HDD
   4 of them will be block producers, preferably in different locations and disconnected from the internet
   the 5th will be the API access node and will be near one of the BP nodes and allow access from the internet.
3. We will start the blockchain on the controller and then add the BP nodes and finally start the API node.
4. The BP servers should have a port open just for peer to peer communication for the blockchain
5. The 5th server will have 2 ports open, one for the blockchain communication and the other for web API requests.

# Step by step instructions
1. ssh to the controller server

2. pick a name for the controller server and set a variable to it:
CONTROLSERVER=EOSinaBox-controller

3. run the following command (copy paste the whole section and hit enter)

sudo hostnamectl set-hostname $CONTROLSERVER && \
sudo systemctl restart systemd-logind.service && \
sudo apt update -qqy && \
sudo apt upgrade -qqy && \
wget https://github.com/EOSIO/eos/releases/download/v1.7.4/eosio_1.7.4-1-ubuntu-18.04_amd64.deb && \
sudo apt install ./eosio_1.7.4-1-ubuntu-18.04_amd64.deb && \
sudo apt install zip unzip -qqy && \
mkdir dev && \
cd ~/dev && \
wget https://github.com/eosinabox/spinPrivateBlockchain/archive/master.zip && \
unzip master.zip && \
rm master.zip && \
mv spinPrivateBlockchain-master/ eosinabox1 && \
cd ~/dev/eosinabox1

4. Start an EOS wallet, save the password for later use in a file and store a private key in it.

cleos wallet create --file README_cleos_wallet_password.md
cat ~/README_cleos_wallet_password.md | cleos wallet unlock
export PUBKEY=$(cleos create key --to-console | grep Private | sed 's/Private key: //g' | cleos wallet import --private-key | sed 's/private key: imported private key for: //g')


