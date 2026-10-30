export type KnowledgeDocument = {
  sourceId: string;
  title: string;
  content: string;
};

export const faqDocuments: KnowledgeDocument[] = [
  {
    sourceId: 'faq:reservation',
    title: 'Réserver une place',
    content:
      'Pour réserver, connectez-vous puis choisissez un événement et une catégorie. Une réservation temporaire bloque les places pendant 10 minutes. Le stock n’est confirmé qu’après le paiement simulé.',
  },
  {
    sourceId: 'faq:payment',
    title: 'Paiement de démonstration',
    content:
      'TicketRush fonctionne localement avec un fournisseur de paiement fictif. Aucun paiement bancaire réel n’est effectué. Une réservation non payée expire après 10 minutes.',
  },
  {
    sourceId: 'faq:tickets',
    title: 'Retrouver ses billets',
    content:
      'Après confirmation de la commande, les billets PDF apparaissent dans « Mes billets » dès que leur génération est terminée. Une notification peut être retardée sans empêcher leur disponibilité dans la commande.',
  },
  {
    sourceId: 'faq:entry',
    title: 'Présenter le billet à l’entrée',
    content:
      'Chaque billet contient un QR code contrôlé à l’entrée. Un billet accepté est marqué comme utilisé et ne peut pas être accepté une seconde fois.',
  },
  {
    sourceId: 'faq:organizer',
    title: 'Espace organisateur',
    content:
      'Les fonctionnalités de publication sont réservées aux comptes auxquels un administrateur a attribué le rôle organisateur. La création publique d’un compte ne peut pas choisir ce rôle.',
  },
];
