/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/unbox_escrow.json`.
 */
export type UnboxEscrow = {
  "address": "CEoTTEq46mxFrNqPu9EbpFbDshsrSTZV9GB14XPT1Nyq",
  "metadata": {
    "name": "unboxEscrow",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Escrow for second-hand clothes with QR-verified delivery and a narrow AI arbiter"
  },
  "instructions": [
    {
      "name": "acceptDelivery",
      "discriminator": [
        153,
        42,
        84,
        137,
        56,
        87,
        13,
        64
      ],
      "accounts": [
        {
          "name": "buyer",
          "signer": true,
          "relations": [
            "deal"
          ]
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.seller",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.dealId",
                "account": "deal"
              }
            ]
          }
        },
        {
          "name": "seller",
          "writable": true,
          "relations": [
            "deal"
          ]
        }
      ],
      "args": [
        {
          "name": "qrSecret",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "cancelListing",
      "discriminator": [
        41,
        183,
        50,
        232,
        230,
        233,
        157,
        70
      ],
      "accounts": [
        {
          "name": "seller",
          "signer": true,
          "relations": [
            "deal"
          ]
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.seller",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.dealId",
                "account": "deal"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "confirmReturn",
      "discriminator": [
        4,
        2,
        116,
        9,
        172,
        37,
        212,
        19
      ],
      "accounts": [
        {
          "name": "seller",
          "signer": true,
          "relations": [
            "deal"
          ]
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.seller",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.dealId",
                "account": "deal"
              }
            ]
          }
        },
        {
          "name": "buyer",
          "writable": true,
          "relations": [
            "deal"
          ]
        }
      ],
      "args": [
        {
          "name": "returnQrSecret",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "createListing",
      "discriminator": [
        18,
        168,
        45,
        24,
        191,
        31,
        117,
        54
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "seller"
              },
              {
                "kind": "arg",
                "path": "dealId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "dealId",
          "type": "u64"
        },
        {
          "name": "priceLamports",
          "type": "u64"
        },
        {
          "name": "listingHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "metadataUri",
          "type": "string"
        },
        {
          "name": "arbiter",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "markReturned",
      "discriminator": [
        119,
        109,
        138,
        54,
        42,
        18,
        68,
        238
      ],
      "accounts": [
        {
          "name": "buyer",
          "signer": true,
          "relations": [
            "deal"
          ]
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.seller",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.dealId",
                "account": "deal"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "returnQrCommitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "returnVideoHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "returnTrackingNumber",
          "type": "string"
        }
      ]
    },
    {
      "name": "markShipped",
      "discriminator": [
        239,
        5,
        66,
        105,
        238,
        17,
        89,
        97
      ],
      "accounts": [
        {
          "name": "seller",
          "signer": true,
          "relations": [
            "deal"
          ]
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.seller",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.dealId",
                "account": "deal"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "qrCommitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "packingVideoHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "trackingNumber",
          "type": "string"
        }
      ]
    },
    {
      "name": "openDispute",
      "discriminator": [
        137,
        25,
        99,
        119,
        23,
        223,
        161,
        42
      ],
      "accounts": [
        {
          "name": "buyer",
          "signer": true,
          "relations": [
            "deal"
          ]
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.seller",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.dealId",
                "account": "deal"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "qrSecret",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "unboxingVideoHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "complaintHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "purchase",
      "discriminator": [
        21,
        93,
        113,
        154,
        193,
        160,
        242,
        168
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.seller",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.dealId",
                "account": "deal"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "expectedListingHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "expectedArbiter",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "resolveDispute",
      "discriminator": [
        231,
        6,
        202,
        6,
        96,
        103,
        12,
        230
      ],
      "accounts": [
        {
          "name": "arbiter",
          "signer": true,
          "relations": [
            "deal"
          ]
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.seller",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.dealId",
                "account": "deal"
              }
            ]
          }
        },
        {
          "name": "seller",
          "writable": true,
          "relations": [
            "deal"
          ]
        }
      ],
      "args": [
        {
          "name": "verdict",
          "type": {
            "defined": {
              "name": "verdict"
            }
          }
        },
        {
          "name": "reportHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "settleExpired",
      "discriminator": [
        187,
        68,
        57,
        40,
        121,
        72,
        73,
        161
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "Anyone: nobody has to \"guard\" the deal."
          ],
          "signer": true
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.seller",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.dealId",
                "account": "deal"
              }
            ]
          }
        },
        {
          "name": "seller",
          "writable": true,
          "relations": [
            "deal"
          ]
        },
        {
          "name": "buyer",
          "writable": true,
          "relations": [
            "deal"
          ]
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "deal",
      "discriminator": [
        125,
        223,
        160,
        234,
        71,
        162,
        182,
        219
      ]
    }
  ],
  "events": [
    {
      "name": "dealStatusChanged",
      "discriminator": [
        98,
        234,
        36,
        195,
        202,
        68,
        60,
        46
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidStatus",
      "msg": "Action not allowed in the current status"
    },
    {
      "code": 6001,
      "name": "unauthorized",
      "msg": "Signer is not allowed to perform this action"
    },
    {
      "code": 6002,
      "name": "deadlinePassed",
      "msg": "Deadline has passed"
    },
    {
      "code": 6003,
      "name": "deadlineNotReached",
      "msg": "Deadline has not been reached yet"
    },
    {
      "code": 6004,
      "name": "invalidPrice",
      "msg": "Price must be greater than zero"
    },
    {
      "code": 6005,
      "name": "sameParty",
      "msg": "Buyer and seller must be different"
    },
    {
      "code": 6006,
      "name": "listingHashMismatch",
      "msg": "Listing hash does not match"
    },
    {
      "code": 6007,
      "name": "arbiterMismatch",
      "msg": "Arbiter does not match"
    },
    {
      "code": 6008,
      "name": "qrMismatch",
      "msg": "QR secret does not match the commitment"
    },
    {
      "code": 6009,
      "name": "invalidVerdict",
      "msg": "Verdict must be Seller or Buyer"
    },
    {
      "code": 6010,
      "name": "stringTooLong",
      "msg": "Text is too long"
    },
    {
      "code": 6011,
      "name": "emptyText",
      "msg": "Text must not be empty"
    },
    {
      "code": 6012,
      "name": "emptyHash",
      "msg": "Hash must not be empty"
    },
    {
      "code": 6013,
      "name": "notImplemented",
      "msg": "Not implemented yet"
    }
  ],
  "types": [
    {
      "name": "deal",
      "docs": [
        "One account per listing; it also holds the escrowed lamports.",
        "Strings are last so `status` sits at a fixed offset (STATUS_OFFSET) for memcmp filters."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "arbiter",
            "type": "pubkey"
          },
          {
            "name": "dealId",
            "type": "u64"
          },
          {
            "name": "priceLamports",
            "type": "u64"
          },
          {
            "name": "listingHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "dealStatus"
              }
            }
          },
          {
            "name": "statusChangedAt",
            "type": "i64"
          },
          {
            "name": "qrCommitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "packingVideoHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "unboxingVideoHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "complaintHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "verdict",
            "type": {
              "defined": {
                "name": "verdict"
              }
            }
          },
          {
            "name": "reportHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "returnQrCommitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "returnVideoHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "metadataUri",
            "type": "string"
          },
          {
            "name": "trackingNumber",
            "type": "string"
          },
          {
            "name": "returnTrackingNumber",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "dealStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "listed"
          },
          {
            "name": "paid"
          },
          {
            "name": "shipped"
          },
          {
            "name": "disputed"
          },
          {
            "name": "returnRequested"
          },
          {
            "name": "returning"
          },
          {
            "name": "completed"
          },
          {
            "name": "refunded"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "dealStatusChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "deal",
            "type": "pubkey"
          },
          {
            "name": "from",
            "type": {
              "defined": {
                "name": "dealStatus"
              }
            }
          },
          {
            "name": "to",
            "type": {
              "defined": {
                "name": "dealStatus"
              }
            }
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "verdict",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "none"
          },
          {
            "name": "seller"
          },
          {
            "name": "buyer"
          }
        ]
      }
    }
  ]
};
