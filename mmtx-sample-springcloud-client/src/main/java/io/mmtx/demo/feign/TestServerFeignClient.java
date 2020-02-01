package io.mmtx.demo.feign;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;

@FeignClient(name = "demo-server")
public interface TestServerFeignClient {

	@GetMapping("/insertRow")
	Boolean insertRow();
	
}
