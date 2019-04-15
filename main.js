#!/usr/bin/node

root_dir = __dirname + "/";
config = root_dir + "/config/";
lib = root_dir + "/lib/";

//Paramètres de connexions MQSQL
var sql = require("mssql");

    // config BDD MQSQL
    var config = {
        user: '',
        password: '',
        server: 'sqlp300.groupement.systeme-u.fr', 
        database: 'ROOCNPS2',
		connectionTimeout:3000,
		pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 5000
        }
    };

//Paramètres de connexions PostGreSQL
var pg = require('pg');

    // config BDD PostGreSQL
    var client = new pg.Client({
        user: "",
        password: "",
        database: "smartmeeting",
        port: 5432,
        host: "10.178.150.25"
    });

//Variables de formatage de date 
var dateFormat = require('dateformat');
//Variables de comparaison d'objets JSON
var objectDiff = require("objectdiff");


    //Création de la connexion MSSQL
    async function connection() {
        console.log("Trying connection to server MSSQL...");
        const pool = await sql.connect(config);
        console.log("Connection established");
    }

    //Création de la connexion PostGreSQL
    async function connectionPG() {
        console.log("Trying connection to server PostGreSQL...");
        const pool = await client.connect();
        console.log("Connection established");
    }

    //Insérer une réservation dans la BDD PG
    async function insererReservation(id, infos, finEvt, statut) {
        try{
            const resultatInsert = await client.query({
                name : 'insert res',
                text : 'INSERT INTO reservation (id, informations, datefin, statut) values ($1, $2, $3, $4)',
                values: [id, infos, finEvt, statut]
            });
        }catch(err) {
            console.log("Error at execute request : " + err)
            process.exit()
        }
    }

    //Mettre à jour une réservation dans la BDD PG
    async function majReservation(id, infos, finEvt, statut) {
        try{
            const resultatUpdate = await client.query({
                name : 'update res',
                text : 'UPDATE reservation SET informations=$2, datefin=$3, statut=$4 WHERE id=$1',
                values: [id, infos, finEvt, statut]
            });
        }catch(err) {
            console.log("Error at execute request : " + err)
            process.exit()
        }
    }

    //Suppression logique d'une réservation dans la BDD PG
    async function suppReservation(id,statut) {
        try{
            const resultatUpdate = await client.query({
                name : 'delete res',
                text : 'UPDATE reservation SET statut=$2 WHERE id=$1',
                values: [id, statut]
            });
        }catch(err) {
            console.log("Error at execute request : " + err)
            process.exit()
        }
    }

    //Méthode principale
   async function main()
   {
        try {
             //Connexion dans la BDD SQL
            await connection();
            //Connexion dans la BDD PG
            await connectionPG();
            
            //Initialisation date du jour à minuit
            var date = new Date();
            date.setHours(0,0,0,0);

    /***------------------------------------------------------------------------------- ***/
            //Gestion de l'ajout et de la mise à jour de données dans PgSQL
    /***------------------------------------------------------------------------------- ***/ 
            const result = await sql.query`select r.CleReservation, r.CleSalle, r.Objet, r.DateReservation, r.HeureDebut, r.HeureFin, 
            r.CleContactOrganisateur, r.Organisateur, r.Confidentielle, r.Preparation, r.Liberation, c.EMail, u.EMail  
            from reservation r inner join utilisateur u on r.auteur = u.code 
            left join contact c on c.CleContact = r.CleContactOrganisateur
            where DateReservation >= ${date}`;

            for(var i=0; i<result.recordset.length; i++)
            {
                //Récupération de la clé de réservaton
                var key = result.recordset[i].CleReservation;
         
                //Requête sur la BDD PsgSQL avec la clé de réservation récupérée
                const resultatSelect = await client.query(
                    {
                        text : "SELECT * FROM reservation where id = $1",
                        values: [key]
                    });
                
                //On vérifie que la réservation n'existe pas dans la base pour l'insérer 
                if(resultatSelect.rowCount==0)
                {
                    console.log("--------------------Insertion de la Réservation : " + key + "-----------------------");
                    
                    //Extraction de la date de réservation
                    var dateReservation = result.recordset[i].DateReservation;
                    var jour = dateReservation.getDate();
                    if(jour.toString().length<2){jour = '0'+ jour;}
                    var mois = dateReservation.getMonth() + 1; 
                    if(mois.toString().length<2){mois = '0'+ mois;}
                    const annee = dateReservation.getFullYear();
                    dateReservation = annee + '-' + mois + '-' + jour;
                
                    //Début et fin de la réunion en format Date
                    var hDebut = result.recordset[i].HeureDebut.toISOString();
                    hDebut = dateReservation + hDebut.substr(10);
                    var hFin = result.recordset[i].HeureFin.toISOString();
                    hFin = dateReservation + hFin.substr(10);              

                    //Création de l'objet JSON pour insértion dans la BDD PgSQL
                    var infosReservation = {
                        salle : result.recordset[i].CleSalle,
                        objet : result.recordset[i].Objet,
                        debut : hDebut,
                        fin : hFin,
                        organisateur : result.recordset[i].CleContactOrganisateur,
                        nomOrganisateur : result.recordset[i].Organisateur,
                        confidentielle : result.recordset[i].Confidentielle,
                        mailOrganisateur : result.recordset[i].EMail[0],
                        mailCreateur : result.recordset[i].EMail[1],
                        preparation : result.recordset[i].Preparation,
                        liberation : result.recordset[i].Liberation
                    }

                    //Insertion de la réservation dans PgSQL
                    await insererReservation(key, infosReservation, infosReservation.fin, 0);
                    console.log("Insertion réalisée avec succès ");
                }else{
                    // Si la réservation existe, alors on récupère son statut dans PgSQL
                    const statut = resultatSelect.rows[0].statut;

                    //Si le statut est égal à 1, on vérifie s'il y a des modifications à apporter
                    if(statut == 1){

                         //Création de l'objet JSON PgSQL
                        var elementPgsql = {
                            salle : resultatSelect.rows[0].informations.salle,
                            date : dateFormat(resultatSelect.rows[0].datefin, "dd/mm/yyyy"),
                            debut : resultatSelect.rows[0].informations.debut.substr(11,5),
                            fin : resultatSelect.rows[0].informations.fin.substr(11,5),
                            organisateur : resultatSelect.rows[0].informations.organisateur,
                            confidentielle : resultatSelect.rows[0].informations.confidentielle,
                            preparation : resultatSelect.rows[0].informations.preparation,
                            liberation : resultatSelect.rows[0].informations.liberation
                        }
                       
                         //Création de l'objet JSON Room
                         var elementRoom = {
                            salle : result.recordset[i].CleSalle,
                            date : dateFormat(result.recordset[i].DateReservation, "dd/mm/yyyy"),
                            debut : result.recordset[i].HeureDebut.toISOString().substr(11,5),
                            fin : result.recordset[i].HeureFin.toISOString().substr(11,5),
                            organisateur : result.recordset[i].CleContactOrganisateur,
                            confidentielle : result.recordset[i].Confidentielle,
                            preparation : result.recordset[i].Preparation,
                            liberation : result.recordset[i].Liberation
                        }

                        //Comparaison des deux objets JSON PgSQL et Room
                        var etat = objectDiff.diff(elementRoom,elementPgsql).changed;  
                  
                        //S'il n'y a aucun changement, on ne fait rien, sinon on fait la mise à jour
                        if(etat!='equal')
                        {
                            //Extraction de la date de réservation en format String
                            var dateReservation = result.recordset[i].DateReservation;
                            var jour = dateReservation.getDate();
                            if(jour.toString().length<2){jour = '0'+ jour;}
                            var mois = dateReservation.getMonth() + 1; 
                            if(mois.toString().length<2){mois = '0'+ mois;}
                            const annee = dateReservation.getFullYear();
                            dateReservation = annee + '-' + mois + '-' + jour;
                        
                            //Début et fin de la réunion en format Date
                            var hDebut = result.recordset[i].HeureDebut.toISOString();
                            hDebut = dateReservation + hDebut.substr(10);
                            var hFin = result.recordset[i].HeureFin.toISOString();
                            hFin = dateReservation + hFin.substr(10);              

                            //Création de l'objet JSON avec les nouvelles données pour insértion dans la BDD PGSQL
                            var infosReservation = {
                                salle : result.recordset[i].CleSalle,
                                objet : result.recordset[i].Objet,
                                debut : hDebut,
                                fin : hFin,
                                organisateur : result.recordset[i].CleContactOrganisateur,
                                nomOrganisateur : result.recordset[i].Organisateur,
                                confidentielle : result.recordset[i].Confidentielle,
                                mailOrganisateur : result.recordset[i].EMail[0],
                                mailCreateur : result.recordset[i].EMail[1],
                                preparation : result.recordset[i].Preparation,
                                liberation : result.recordset[i].Liberation
                            }

                            //Mise à jour de la réservation dans PgSQL
                            await majReservation(key, infosReservation, infosReservation.fin, 2);
                            console.log("Mise à jour réalisée avec succès ");
                        }
                    }
                }
            }

    /***------------------------------------------------------------------------------- ***/
            //Gestion de la suppression de données dans PgSQL
    /***------------------------------------------------------------------------------- ***/
    //On récupère toutes les réservations avec un statut à 1 (Importées dans Google Calendar)        
    const rs = await client.query(
            {
                text : "SELECT * FROM reservation where statut = 1 and datefin >= $1",
                values: [date]
            });
            
            for(var i=0; i<rs.rowCount; i++)
            {
                    //Récupération de la clé de réservaton
                    var id = rs.rows[0].id;
             
                    //On vérifie si la réservation n'existe plus dans Rooming'IT
                    const rsRoom = await sql.query`select * from reservation where CleReservation = ${id}`;
                    
                    // Si la réservation n'existe pas, on la "supprime" de PgSQL
                    if(rsRoom.recordset.length==0)
                    {
                        //Suppression logique de la réservation dans PgSQL
                        await suppReservation(id, 3);
                        console.log("Suppression réalisée avec succès ");
                    }
            }

            sql.close();
            process.exit();
			//return result
        } catch (err) {
            console.log("Error : " + err);
			process.exit();
        }
    }

    	
main()


