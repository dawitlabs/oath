use oath::contract::{Contract, Presence};

const EXAMPLE: &str = include_str!("../examples/payments.contract.json");

#[test]
fn parses_example_contract() {
    let contract: Contract = serde_json::from_str(EXAMPLE).unwrap();
    assert_eq!(contract.service, "payments");

    let endpoint = &contract.endpoints[0];
    assert_eq!(endpoint.method, "GET");
    assert_eq!(endpoint.path, "/v1/charges/{id}");

    let fields = &endpoint.responses["200"].fields;
    assert_eq!(fields["amount"].kind, "number");
    assert_eq!(fields["amount"].presence, Presence::Always);
    assert_eq!(fields["legacy_id"].presence, Presence::Sometimes);
}

#[test]
fn serializes_fields_in_stable_order() {
    let contract: Contract = serde_json::from_str(EXAMPLE).unwrap();
    let output = serde_json::to_string(&contract).unwrap();

    let amount = output.find("\"amount\"").unwrap();
    let id = output.find("\"id\"").unwrap();
    let legacy_id = output.find("\"legacy_id\"").unwrap();
    assert!(amount < id && id < legacy_id, "fields must serialize sorted: {output}");
}

#[test]
fn writes_type_key_not_kind() {
    let contract: Contract = serde_json::from_str(EXAMPLE).unwrap();
    let output = serde_json::to_string(&contract).unwrap();
    assert!(output.contains("\"type\":\"number\""), "{output}");
    assert!(output.contains("\"presence\":\"sometimes\""), "{output}");
}
