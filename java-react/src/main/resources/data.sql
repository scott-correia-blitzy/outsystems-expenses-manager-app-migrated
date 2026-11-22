MERGE INTO Currency (Id, Label, "Order", Is_Active) KEY (Id) VALUES (1, 'Euro', 1, TRUE);
MERGE INTO Currency (Id, Label, "Order", Is_Active) KEY (Id) VALUES (2, 'Dollar', 2, TRUE);

-- Draft and Submitted share Order 2, as in the legacy model.
MERGE INTO Status (Id, Label, "Order", Is_Active) KEY (Id) VALUES (1, 'Draft', 2, TRUE);
MERGE INTO Status (Id, Label, "Order", Is_Active) KEY (Id) VALUES (2, 'Submitted', 2, TRUE);
MERGE INTO Status (Id, Label, "Order", Is_Active) KEY (Id) VALUES (3, 'Approved', 3, TRUE);
MERGE INTO Status (Id, Label, "Order", Is_Active) KEY (Id) VALUES (4, 'Declined', 4, TRUE);

MERGE INTO ExpenseType (Id, Label, "Order", Is_Active) KEY (Id) VALUES (1, 'Restaurant', 1, TRUE);
MERGE INTO ExpenseType (Id, Label, "Order", Is_Active) KEY (Id) VALUES (2, 'Travel', 2, TRUE);
MERGE INTO ExpenseType (Id, Label, "Order", Is_Active) KEY (Id) VALUES (3, 'Kilometers', 3, TRUE);
MERGE INTO ExpenseType (Id, Label, "Order", Is_Active) KEY (Id) VALUES (4, 'Other', 4, TRUE);

MERGE INTO EarningType (Id, Label, "Order", Is_Active) KEY (Id) VALUES (1, 'Salary', 1, TRUE);
MERGE INTO EarningType (Id, Label, "Order", Is_Active) KEY (Id) VALUES (2, 'Investment', 2, TRUE);
MERGE INTO EarningType (Id, Label, "Order", Is_Active) KEY (Id) VALUES (3, 'Service', 3, TRUE);
MERGE INTO EarningType (Id, Label, "Order", Is_Active) KEY (Id) VALUES (4, 'Other', 4, TRUE);
