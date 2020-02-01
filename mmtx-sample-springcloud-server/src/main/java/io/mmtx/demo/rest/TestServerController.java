package io.mmtx.demo.rest;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import io.mmtx.demo.service.TestServerService;

@RestController
public class TestServerController {
	@Autowired
	private TestServerService testServerService;

	@GetMapping("/insertRow")
	public Boolean insertRow(){
		return testServerService.insertRow();
	}
}
