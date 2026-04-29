Tes propositions sont cohérentes, et oui : si relay + participation sont automatiques, inutile de créer des commandes publiques pour ça.

Je structurerais comme ça :

**Commandes À Garder**
`/me`
Affiche les infos de l’utilisateur et, si lancé depuis un message ou avec une référence message selon l’implémentation :
- ID utilisateur;
- username;
- rôles bot;
- sessions GTC;
- scores;
- infos du message original associé;
- serveur d’origine du message original;
- salon d’origine;
- lien du message original si disponible.

Par contre, si tu veux vraiment l’équivalent de `message-info`, je ferais plutôt une commande contextuelle Discord sur message nommée `Message info`. `/me` devrait rester centré sur l’utilisateur courant. Sinon le nom devient ambigu.

`/user-id`
Renvoie uniquement l’ID Discord de l’utilisateur courant, en ephemeral.

`/user sync`
Admin bot only.
Force la création/mise à jour d’un utilisateur en DB.

Variantes utiles :
- `/user sync me`
- `/user sync target <user>`
- `/user info <user>` éventuellement admin/debug.

`/settings guild`
Bonne idée. Un message avec boutons/select menus est mieux que 10 commandes.
À gérer dedans :
- salon GTC;
- rôle ping;
- webhook;
- serveur organisateur oui/non;
- relay messages on/off;
- relay reactions on/off;
- suppression depuis organisateur on/off.

`/session create`
Remplace bien `/gtc create`.

`/session manage`
Très bonne commande centrale.
Elle peut afficher une interface avec boutons/select menus pour :
- start/end/cancel;
- modifier points par bonne réponse;
- activer/désactiver points;
- ajouter/retirer serveurs participants;
- ajouter/retirer managers;
- voir statut;
- voir participants;
- voir classement.

`/session list`
Je l’ajouterais quand même, sinon retrouver une session devient pénible.

`/session info <session>`
Utile pour debug et transparence, même si `manage` existe.

**Points / Scores**
`/points give`
Pour donner des points à un user sans message.

`/points give-message`
Commande contextuelle sur message.
C’est probablement la commande la plus importante pour ton workflow : donner le point directement depuis le message.

`/points revoke`
Annule une attribution.

`/points history`
Voir l’historique d’un user dans une session.

`/score`
Score d’un user.

`/leaderboard`
Classement d’une session.

**Commandes Que Je Supprimerais De La Liste**
`/gtc join`, `/gtc participants`
Si participation automatique, pas besoin sauf éventuellement debug admin.

`/relay *`
Pas nécessaire si le relais est automatique. Garde seulement une action interne ou un bouton admin dans `/session manage` si tu veux forcer une resynchro plus tard.

`/audit *`
Pas prioritaire. Les logs peuvent rester en DB sans commande au début.

**Liste Finale Recommandée**
- `/me`
- `/user-id`
- `/user sync`
- `/settings guild`
- `/session create`
- `/session manage`
- `/session list`
- `/session info`
- `/points give`
- commande contextuelle `Give point`
- `/points revoke`
- `/points history`
- `/score`
- `/leaderboard`

Ça fait une surface de commandes propre : peu de commandes, mais des commandes de gestion riches via composants Discord.
