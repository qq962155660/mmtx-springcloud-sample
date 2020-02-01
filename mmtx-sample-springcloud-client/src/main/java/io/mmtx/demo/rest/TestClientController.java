package io.mmtx.demo.rest;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import io.mmtx.demo.service.TestClientService;

@RestController
public class TestClientController {
	
	@Autowired
	private TestClientService testClientService;
	
	@GetMapping(value = "/tx/save/exe")
    public Boolean debit() {
		 return testClientService.txExe();
    }
	
	@GetMapping(value = "/tx-mm/save")
    public Boolean txMM() {
		 return testClientService.txMM();
    }

	@GetMapping(value = "/tx-mm/save/exe")
    public Boolean txMMExe() {
		 return testClientService.txMMExe();
    }
}
